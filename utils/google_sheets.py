from googleapiclient.discovery import build
from google.oauth2 import service_account
import os
import base64
import json
from dotenv import load_dotenv

# Load environment variables from .env (for local development)
load_dotenv()

def get_google_credentials():
    encoded_creds = os.getenv("GOOGLE_CREDENTIALS_BASE64")
    if not encoded_creds:
        raise Exception("Missing GOOGLE_CREDENTIALS_BASE64 environment variable.")

    credentials_json = base64.b64decode(encoded_creds).decode("utf-8")
    credentials_dict = json.loads(credentials_json)

    creds = service_account.Credentials.from_service_account_info(
        credentials_dict,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )

    return creds

def append_to_sheet(sheet_id, data_dict):
    creds = get_google_credentials()
    service = build("sheets", "v4", credentials=creds)

    # Ensure data_dict values are in the same order each time
    keys = list(data_dict.keys())
    values = [[data_dict[key] for key in keys]]

    service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range="Sheet1!A1",
        valueInputOption="RAW",
        body={"values": values}
    ).execute()
