import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
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
y = justice_df['winner_index']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

outcome_model = LogisticRegression()
outcome_model.fit(X_train, y_train)

print("Saving models...")
joblib.dump(outcome_model, "outcome_model.pkl")
joblib.dump(outcome_vectorizer, "outcome_vectorizer.pkl")
print("Done! Models saved as outcome_model.pkl and outcome_vectorizer.pkl")
