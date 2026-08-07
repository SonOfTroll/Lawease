"""Train the outcome predictor and build the precedent index.

Produces three artefacts consumed by app.py at boot:
  outcome_model.pkl       LogisticRegression over TF-IDF
  outcome_vectorizer.pkl  the fitted TfidfVectorizer
  precedent_index.pkl     row-normalised TF-IDF matrix + case metadata,
                          used to find real decided cases nearest to a query

Run this whenever justice.csv changes:  python train_outcome.py
"""

import numpy as np
import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

print("Loading data...")
justice_df = pd.read_csv("justice.csv")
justice_df.rename(columns={'facts': 'facts', 'first_party': 'first_party',
                            'second_party': 'second_party', 'first_party_winner': 'winner_index'}, inplace=True)
if justice_df['winner_index'].isnull().any():
    justice_df['winner_index'] = justice_df['winner_index'].fillna(0).astype(int)

justice_df['merged_facts'] = (justice_df['first_party'].fillna('') + " " +
                                justice_df['second_party'].fillna('') + " " +
                                justice_df['facts'].fillna(''))
justice_df.dropna(subset=['merged_facts'], inplace=True)

print("Training model...")
outcome_vectorizer = TfidfVectorizer(max_features=2000)
X = outcome_vectorizer.fit_transform(justice_df['merged_facts'])
y = justice_df['winner_index'].astype(int)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

outcome_model = LogisticRegression()
outcome_model.fit(X_train, y_train)

holdout_accuracy = accuracy_score(y_test, outcome_model.predict(X_test))
base_rate = float(y.mean())
print(f"Holdout accuracy: {holdout_accuracy:.3f}  (always-guess-petitioner scores {max(base_rate, 1 - base_rate):.3f})")

print("Saving models...")
joblib.dump(outcome_model, "outcome_model.pkl")
joblib.dump(outcome_vectorizer, "outcome_vectorizer.pkl")

# ----- Precedent index -------------------------------------------------
# TfidfVectorizer L2-normalises rows, so a dot product against the corpus
# matrix is already cosine similarity. Store float32 to halve the artefact.
print("Building precedent index...")


def oyez_page(api_url):
    """api.oyez.org/cases/1971/70-18 -> www.oyez.org/cases/1971/70-18"""
    if not isinstance(api_url, str):
        return ""
    return api_url.replace("://api.oyez.org/", "://www.oyez.org/")


meta = [
    {
        "name": row.name_,
        "url": oyez_page(row.href),
        "term": str(row.term) if pd.notna(row.term) else "",
        "first_party": row.first_party if pd.notna(row.first_party) else "",
        "second_party": row.second_party if pd.notna(row.second_party) else "",
        "disposition": row.disposition if pd.notna(row.disposition) else "",
        "petitioner_won": bool(row.winner_index),
    }
    for row in justice_df.rename(columns={"name": "name_"}).itertuples(index=False)
]

precedent_index = {
    "matrix": X.astype(np.float32),
    "meta": meta,
    "base_rate": base_rate,
    "holdout_accuracy": float(holdout_accuracy),
    "n_cases": int(X.shape[0]),
}
joblib.dump(precedent_index, "precedent_index.pkl", compress=3)

print(f"Done. Indexed {X.shape[0]} decided cases.")
