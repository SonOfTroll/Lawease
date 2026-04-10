from dotenv import load_dotenv
import os


load_dotenv()


AGREEMENT_CONFIGS = {
    "partnership": {
        "template_id": "1au1029fUgcVRc52k7OGWLH3YLaqVeBi5iqBto_Z7rJc",
        "sheet_id": "18VhktcQfgYMfaBwWgD4-K8fwxPSXn0drqZxuy_1r4yE"
    },
    "ip": {
        "template_id": "1xu1DEMjWy2yiBjmvsEzyZ4sjNpHv6cdCY8xtJFUTq5w",
        "sheet_id": "11hqBGBCOAgQ4oeCKlfUO76ZtDOlEotz6IX00a6Mm1G0"
    },
    "nda" : {
        "template_id": "1Ibzr8TFGEncpE1_VUEseXz2Y3R5hAMxDYNppdmtuPUo",
        "sheet_id": "1nhYRfEPZmdf8yyLEUtI8pPeY6GzAZfKZH_rxSYvxnus"
    }

}

SENDER_EMAIL = os.getenv("GMAIL_SENDER")
APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
