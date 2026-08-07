from flask import Flask, request, jsonify, render_template
import cohere
from dotenv import load_dotenv
import os
import json
import re
import joblib
import numpy as np
import pandas as pd

app = Flask(__name__)

# Load environment variables from .env file
load_dotenv()

from config import AGREEMENT_CONFIGS
from utils.google_sheets import append_to_sheet
from utils.google_docs import fill_template_and_export
from utils.email_sender import send_email_with_attachment
from utils.contract_xray import (
    MAX_CONTRACT_CHARS,
    build_xray_prompt,
    extract_text_from_upload,
    normalise_xray,
    parse_json_block,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def find_artifact(filename):
    """Model artefacts live either at the project root or under Layer/."""
    for candidate in (os.path.join(BASE_DIR, filename),
                      os.path.join(BASE_DIR, "Layer", filename)):
        if os.path.exists(candidate):
            return candidate
    return None


def load_artifact(filename):
    path = find_artifact(filename)
    if path is None:
        raise FileNotFoundError(f"{filename} not found in project root or Layer/")
    return joblib.load(path)


# ===== COHERE CHATBOT SETUP =====
COHERE_API_KEY = os.getenv("COHERE_API_KEY")
COHERE_MODEL = "command-r-plus-08-2024"
if not COHERE_API_KEY:
    print("WARNING: COHERE_API_KEY not set. Chatbot and Contract X-Ray will not work.")
    co = None
else:
    co = cohere.Client(COHERE_API_KEY)

# ===== CASE PREDICTION ML MODELS =====
try:
    cat_model = load_artifact("case_category_model.pkl")
    cat_vectorizer = load_artifact("tfidf_vectorizer.pkl")
    category_info_df = pd.read_csv(find_artifact("Book1.csv"))
    category_info_df.columns = category_info_df.columns.str.strip().str.lower()
    print("Category classification model loaded successfully.")
except Exception as e:
    print(f"WARNING: Could not load category model: {e}")
    cat_model = None
    cat_vectorizer = None
    category_info_df = None

# Load outcome prediction model (pre-trained offline by train_outcome.py)
try:
    outcome_model = load_artifact("outcome_model.pkl")
    outcome_vectorizer = load_artifact("outcome_vectorizer.pkl")
    print("Outcome prediction model loaded successfully.")
except Exception as e:
    print(f"WARNING: Could not load outcome model: {e}")
    outcome_model = None
    outcome_vectorizer = None

# Precedent index: row-normalised TF-IDF over every decided case in justice.csv
try:
    precedent_index = load_artifact("precedent_index.pkl")
    print(f"Precedent index loaded: {precedent_index['n_cases']} cases.")
except Exception as e:
    print(f"WARNING: Could not load precedent index: {e}")
    precedent_index = None

# Category links for Indian Kanoon
CATEGORY_LINKS = {
    "Criminal Law": "https://indiankanoon.org/search/?formInput=criminal%20law",
    "Civil Law": "https://indiankanoon.org/search/?formInput=civil%20law",
    "Family Law": "https://indiankanoon.org/search/?formInput=family%20law",
    "Property Law": "https://indiankanoon.org/search/?formInput=property%20law",
    "Consumer Law": "https://indiankanoon.org/search/?formInput=consumer%20law",
    "Corporate Law": "https://indiankanoon.org/search/?formInput=corporate%20law",
    "Employment Law": "https://indiankanoon.org/search/?formInput=employment%20law",
    "Tax Law": "https://indiankanoon.org/search/?formInput=tax%20law",
    "Intellectual Property Law": "https://indiankanoon.org/search/?formInput=intellectual%20property%20law",
    "Constitutional Law": "https://indiankanoon.org/search/?formInput=constitutional%20law",
    "Environmental Law": "https://indiankanoon.org/search/?formInput=environmental%20law",
    "Cyber Law": "https://indiankanoon.org/search/?formInput=cyber%20law",
    "Human Rights Law": "https://indiankanoon.org/search/?formInput=human%20rights%20law",
    "Civil Rights": "https://indiankanoon.org/search/?formInput=civil%20rights",
    "Due Process": "https://indiankanoon.org/search/?formInput=due%20process",
    "First Amendment": "https://indiankanoon.org/search/?formInput=first%20amendment",
    "Criminal Procedure": "https://indiankanoon.org/search/?formInput=criminal%20procedure",
    "Privacy": "https://indiankanoon.org/search/?formInput=privacy",
    "Federal Taxation": "https://indiankanoon.org/search/?formInput=federal%20taxation",
    "Economic Activity": "https://indiankanoon.org/search/?formInput=economic%20activity",
    "Judicial Power": "https://indiankanoon.org/search/?formInput=judicial%20power",
    "Unions": "https://indiankanoon.org/search/?formInput=unions",
    "Federalism": "https://indiankanoon.org/search/?formInput=federalism",
    "Attorneys": "https://indiankanoon.org/search/?formInput=attorneys",
    "Miscellaneous": "https://indiankanoon.org/search/?formInput=miscellaneous",
    "Interstate Relations": "https://indiankanoon.org/search/?formInput=interstate%20relations",
    "Private Action": "https://indiankanoon.org/search/?formInput=private%20action",
}


# ===== ROUTES =====

@app.route("/")
def home():
    return render_template("index.html")


# --- Chatbot ---
@app.route("/chat", methods=["POST"])
def chat():
    if co is None:
        return jsonify({"response": "The assistant is not configured. Set the COHERE_API_KEY environment variable to switch it on."}), 503

    data = request.get_json()
    user_input = data.get("message", "")

    if not user_input.strip():
        return jsonify({"response": "Type a question first."}), 400

    try:
        response = co.chat(
            message=f"You are a legal assistant. Answer the following legal question concisely: {user_input}",
            model=COHERE_MODEL,
            temperature=0.5
        )
        bot_reply = response.text.strip()
        return jsonify({"response": bot_reply})
    except Exception as e:
        return jsonify({"response": f"The assistant could not answer: {str(e)}"}), 500


# --- Case Classification ---
@app.route("/api/classify", methods=["POST"])
def classify_case():
    if cat_model is None or cat_vectorizer is None:
        return jsonify({"error": "The classification model is not loaded on this server."}), 503

    data = request.get_json()
    facts = data.get("facts", "")

    if not facts.strip():
        return jsonify({"error": "Describe the case first."}), 400

    try:
        input_vectorized = cat_vectorizer.transform([facts])
        predicted_category = cat_model.predict(input_vectorized)[0]

        # Get details from Book1.csv
        details = {}
        if category_info_df is not None:
            match = category_info_df[category_info_df["case_category"] == predicted_category]
            if not match.empty:
                description = match["description"].values[0]
                next_steps_raw = match["next_step"].values[0]
                split_info = next_steps_raw.split(";")
                documents = [d.strip() for d in split_info[:-1]] if len(split_info) > 1 else []
                next_steps = split_info[-1].strip() if len(split_info) > 0 else "No next steps"
                details = {"description": description, "documents": documents, "next_steps": next_steps}

        kanoon_link = CATEGORY_LINKS.get(predicted_category, "")

        return jsonify({
            "category": predicted_category,
            "details": details,
            "kanoon_link": kanoon_link
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Case Outcome Prediction, with evidence ---
def explain_prediction(input_vector, top_n=6):
    """Per-term contribution to the log-odds: coefficient x TF-IDF weight.

    Class 1 is 'first party (petitioner) won', so a positive contribution
    pushes toward the petitioner and a negative one toward the respondent.
    """
    coefs = outcome_model.coef_[0]
    names = outcome_vectorizer.get_feature_names_out()
    row = input_vector.tocoo()

    contributions = [(names[col], float(coefs[col] * val))
                     for col, val in zip(row.col, row.data)
                     if coefs[col] != 0 and len(names[col]) > 2]
    contributions.sort(key=lambda pair: pair[1], reverse=True)

    toward_petitioner = [{"term": t, "weight": round(w, 4)}
                         for t, w in contributions[:top_n] if w > 0]
    toward_respondent = [{"term": t, "weight": round(abs(w), 4)}
                         for t, w in reversed(contributions[-top_n:]) if w < 0]
    return {"petitioner": toward_petitioner, "respondent": toward_respondent}


def find_precedents(input_vector, top_n=5):
    """Cosine similarity against every decided case in the index.

    TfidfVectorizer L2-normalises its rows, so the dot product is the cosine.
    """
    if precedent_index is None:
        return []

    similarities = (precedent_index["matrix"] @ input_vector.T).toarray().ravel()
    if not similarities.any():
        return []

    ranked = np.argsort(similarities)[::-1][:top_n]
    results = []
    for idx in ranked:
        score = float(similarities[idx])
        if score <= 0:
            continue
        case = precedent_index["meta"][idx]
        results.append({**case, "similarity": round(score * 100, 1)})
    return results


@app.route("/api/predict", methods=["POST"])
def predict_outcome():
    if outcome_model is None or outcome_vectorizer is None:
        return jsonify({"error": "The prediction model is not loaded on this server."}), 503

    data = request.get_json()
    first_party = data.get("first_party", "")
    second_party = data.get("second_party", "")
    facts = data.get("facts", "")

    if not first_party.strip() or not second_party.strip():
        return jsonify({"error": "Name both parties."}), 400
    if not facts.strip() or len(facts) < 20:
        return jsonify({"error": "Describe the facts in at least 20 characters."}), 400

    try:
        input_text = first_party + " " + second_party + " " + facts
        input_vector = outcome_vectorizer.transform([input_text])
        probabilities = outcome_model.predict_proba(input_vector)[0]

        # classes_ is [0, 1] and class 1 means the first party won.
        petitioner = float(probabilities[list(outcome_model.classes_).index(1)])
        respondent = 1.0 - petitioner

        precedents = find_precedents(input_vector)
        petitioner_wins = sum(1 for c in precedents if c["petitioner_won"])

        return jsonify({
            "petitioner": round(petitioner * 100, 1),
            "respondent": round(respondent * 100, 1),
            "drivers": explain_prediction(input_vector),
            "precedents": precedents,
            "precedent_tally": {"petitioner": petitioner_wins,
                                "respondent": len(precedents) - petitioner_wins},
            "calibration": {
                "base_rate": round((precedent_index or {}).get("base_rate", 0) * 100, 1),
                "accuracy": round((precedent_index or {}).get("holdout_accuracy", 0) * 100, 1),
                "n_cases": (precedent_index or {}).get("n_cases", 0),
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Contract X-Ray ---
@app.route("/api/xray", methods=["POST"])
def contract_xray():
    if co is None:
        return jsonify({"error": "Contract X-Ray needs a Cohere API key. Set COHERE_API_KEY on the server."}), 503

    # Accepts either a pasted body (JSON) or an uploaded PDF/text file (multipart).
    if request.files.get("file"):
        upload = request.files["file"]
        try:
            text = extract_text_from_upload(upload.filename, upload.read())
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        party = request.form.get("party", "").strip()
    else:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        party = (data.get("party") or "").strip()

    if len(text) < 200:
        return jsonify({"error": "That is too short to read as a contract. Paste at least a few clauses."}), 400

    truncated = len(text) > MAX_CONTRACT_CHARS
    text = text[:MAX_CONTRACT_CHARS]

    try:
        response = co.chat(
            message=build_xray_prompt(text, party),
            model=COHERE_MODEL,
            temperature=0.2,
        )
        parsed = parse_json_block(response.text)
    except ValueError:
        return jsonify({"error": "The reading came back unreadable. Try again, or paste a shorter section."}), 502
    except Exception as e:
        return jsonify({"error": f"Could not read the contract: {str(e)}"}), 500

    result = normalise_xray(parsed)
    result["truncated"] = truncated
    result["reviewed_for"] = party
    return jsonify(result)


# --- Document Generation ---
@app.route("/api/docgen", methods=["POST"])
def generate_document():
    data = request.get_json()
    doc_type = data.get("type", "")
    form_data = data.get("data", {})

    if doc_type not in ["partnership", "nda", "ip"]:
        return jsonify({"error": "Pick a supported agreement type."}), 400

    try:
        config = AGREEMENT_CONFIGS[doc_type]

        # 1. Save data to Google Sheets
        try:
            append_to_sheet(config["sheet_id"], form_data)
        except Exception as e:
            print(f"Warning: Failed to append to sheet: {e}")

        # 2. Fill the Google Docs template and export as PDF
        pdf_bytes = fill_template_and_export(config["template_id"], form_data)

        # 3. Email the PDF to the user
        user_email = form_data.get("email", None)
        if not user_email:
            return jsonify({"error": "Add the email address to send it to."}), 400

        send_email_with_attachment(
            to_email=user_email,
            subject=f"Your LawEase {doc_type.capitalize()} Agreement",
            body_text=f"Hello,\n\nPlease find attached the legally formatted {doc_type.capitalize()} agreement generated via LawEase.\n\nBest,\nLawEase AI",
            attachment_bytes=pdf_bytes,
            filename=f"{doc_type.capitalize()}_Agreement.pdf"
        )

        return jsonify({
            "success": True,
            "message": f"Sent to {user_email}. Check the inbox in a minute.",
        })

    except Exception as e:
        return jsonify({"error": f"Could not draft the agreement: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001)
