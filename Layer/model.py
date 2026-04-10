import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


def load_data():
    df = pd.read_csv("justice.csv")
    df.rename(columns={"facts": "facts", "issue_area": "case_category"}, inplace=True)
    df.dropna(subset=["facts", "case_category"], inplace=True)
    return df

def train_category_model(df):
    vectorizer = TfidfVectorizer(max_features=3000)
    X = vectorizer.fit_transform(df["facts"])
    y = df["case_category"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LogisticRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred)
    matrix = confusion_matrix(y_test, y_pred)
    accuracy = accuracy_score(y_test, y_pred)

    # Save the model and vectorizer
    joblib.dump(model, "case_category_model.pkl")
    joblib.dump(vectorizer, "tfidf_vectorizer.pkl")

    print(f"Accuracy: {accuracy}")
    print(report)
    print(matrix)

    return model, vectorizer

if __name__ == "__main__":
    train_category_model(load_data())
