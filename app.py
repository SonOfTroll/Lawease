from flask import Flask, request, jsonify, render_template
import cohere
from dotenv import load_dotenv
import os
import joblib
import pandas as pd
import numpy as np
import re

app = Flask(__name__)

# Load environment variables from .env file
load_dotenv()

# ===== COHERE CHATBOT SETUP =====
COHERE_API_KEY = os.getenv("COHERE_API_KEY")
if not COHERE_API_KEY:
    print("WARNING: COHERE_API_KEY not set. Chatbot will not work.")
    co = None
else:
    co = cohere.Client(COHERE_API_KEY)

# ===== CASE PREDICTION ML MODELS =====
# Load category classification model
try:
    cat_model = joblib.load("case_category_model.pkl")
    cat_vectorizer = joblib.load("tfidf_vectorizer.pkl")
    category_info_df = pd.read_csv("Book1.csv")
    category_info_df.columns = category_info_df.columns.str.strip().str.lower()
    print("Category classification model loaded successfully.")
except Exception as e:
    print(f"WARNING: Could not load category model: {e}")
    cat_model = None
    cat_vectorizer = None
    category_info_df = None

# Load outcome prediction model (trained on startup)
try:
    justice_df = pd.read_csv("justice.csv")
    justice_df.rename(columns={'facts': 'facts', 'first_party': 'first_party',
                                'second_party': 'second_party', 'first_party_winner': 'winner_index'}, inplace=True)
    if justice_df['winner_index'].isnull().any():
        justice_df['winner_index'] = justice_df['winner_index'].fillna(0).astype(int)
    justice_df['merged_facts'] = (justice_df['first_party'].fillna('') + " " +
                                   justice_df['second_party'].fillna('') + " " +
                                   justice_df['facts'].fillna(''))
    justice_df.dropna(subset=['merged_facts'], inplace=True)

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split

    outcome_vectorizer = TfidfVectorizer(max_features=2000)
    X = outcome_vectorizer.fit_transform(justice_df['merged_facts'])
    y = justice_df['winner_index']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    outcome_model = LogisticRegression()
    outcome_model.fit(X_train, y_train)
    print("Outcome prediction model trained successfully.")
except Exception as e:
    print(f"WARNING: Could not train outcome model: {e}")
    outcome_model = None
    outcome_vectorizer = None

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
        return jsonify({"response": "Chatbot is not configured. Please set the COHERE_API_KEY environment variable."}), 503

    data = request.get_json()
    user_input = data.get("message", "")

    if not user_input.strip():
        return jsonify({"response": "Please enter a message."}), 400

    try:
        response = co.chat(
            message=f"You are a legal assistant. Answer the following legal question concisely: {user_input}",
            model="command-r-plus",
            temperature=0.5
        )
        bot_reply = response.text.strip()
        return jsonify({"response": bot_reply})
    except Exception as e:
        return jsonify({"response": f"Sorry, an error occurred: {str(e)}"}), 500


# --- Case Classification ---
@app.route("/api/classify", methods=["POST"])
def classify_case():
    if cat_model is None or cat_vectorizer is None:
        return jsonify({"error": "Classification model not loaded."}), 503

    data = request.get_json()
    facts = data.get("facts", "")

    if not facts.strip():
        return jsonify({"error": "Please enter case details."}), 400

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


# --- Case Outcome Prediction ---
@app.route("/api/predict", methods=["POST"])
def predict_outcome():
    if outcome_model is None or outcome_vectorizer is None:
        return jsonify({"error": "Prediction model not loaded."}), 503

    data = request.get_json()
    first_party = data.get("first_party", "")
    second_party = data.get("second_party", "")
    facts = data.get("facts", "")

    if not first_party.strip() or not second_party.strip():
        return jsonify({"error": "Both party names are required."}), 400
    if not facts.strip() or len(facts) < 20:
        return jsonify({"error": "Case facts must be at least 20 characters."}), 400

    try:
        input_text = first_party + " " + second_party + " " + facts
        input_vectorized = outcome_vectorizer.transform([input_text])
        probabilities = outcome_model.predict_proba(input_vectorized)[0]

        return jsonify({
            "petitioner": round(float(probabilities[0]) * 100, 2),
            "respondent": round(float(probabilities[1]) * 100, 2)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Document Generation Info ---
@app.route("/api/docgen", methods=["POST"])
def generate_document():
    """Frontend-only for now — shows what would be generated.
    Full integration requires Google API credentials."""
    data = request.get_json()
    doc_type = data.get("type", "")
    form_data = data.get("data", {})

    if doc_type not in ["partnership", "nda", "ip"]:
        return jsonify({"error": "Invalid document type."}), 400

    return jsonify({
        "success": True,
        "message": f"Your {doc_type.upper()} agreement has been prepared. To activate email delivery, configure Google API credentials in the .env file.",
        "type": doc_type,
        "fields_received": len(form_data)
    })


if __name__ == "__main__":
    app.run(debug=True, port=5001)
