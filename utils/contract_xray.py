"""Contract X-Ray: read a contract someone handed you and say what it does.

The model returns JSON; everything here is about getting a trustworthy shape
out of it. Anything the model omits or mangles is dropped rather than passed
through, so the front end never has to defend itself.
"""

import io
import json
import re

MAX_CONTRACT_CHARS = 18000

# How each clause leans. 'yours' only ever appears when the reader told us
# which side they are on — otherwise there is no 'you' to favour.
LEANS = {"yours", "neutral", "theirs", "redflag"}

MAX_CLAUSES = 40
MAX_GAPS = 8


def extract_text_from_upload(filename, raw_bytes):
    """Pull plain text out of an uploaded PDF or text file."""
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError("This server cannot read PDFs. Paste the text instead.")
        try:
            reader = PdfReader(io.BytesIO(raw_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception:
            raise ValueError("That PDF could not be opened. Paste the text instead.")
        text = "\n".join(pages).strip()
        if len(text) < 200:
            raise ValueError("That PDF has no selectable text — it is probably a scan. Paste the text instead.")
        return text

    if name.endswith((".txt", ".md", ".text", "")):
        for encoding in ("utf-8", "utf-16", "latin-1"):
            try:
                return raw_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("That file could not be decoded. Paste the text instead.")

    raise ValueError("Upload a PDF or a text file, or paste the text instead.")


def build_xray_prompt(contract_text, party):
    """Ask for a clause-by-clause reading plus the protections that are absent."""
    if party:
        stance = (
            f'The reader is "{party}" in this contract. Judge every clause from that side: '
            f'"yours" means it favours {party}, "theirs" means it favours the other side.'
        )
    else:
        stance = (
            "The reader did not say which side they are on, so never use \"yours\". "
            "Use \"theirs\" for a clause that is one-sided in favour of the drafting party."
        )

    return f"""You are a contract lawyer explaining a contract to someone with no legal training.

{stance}

Read the contract below and return ONLY a JSON object, no prose and no markdown fences, shaped exactly like this:

{{
  "document_type": "what kind of agreement this is, in plain words",
  "parties": ["party one", "party two"],
  "summary": "one sentence on what this contract does and what the reader is agreeing to",
  "clauses": [
    {{
      "ref": "the clause number as written in the document, or \\"\\" if unnumbered",
      "heading": "three or four words naming what this clause is about",
      "plain": "one or two sentences in plain English on what this clause actually means in practice",
      "lean": "yours | neutral | theirs | redflag",
      "why": "one short sentence on why it leans that way",
      "quote": "the most important phrase from the clause itself, under 20 words, copied verbatim"
    }}
  ],
  "missing": [
    {{
      "item": "a standard protection this contract does not contain",
      "why": "one sentence on what the reader is exposed to without it"
    }}
  ]
}}

Rules:
- Cover every substantive clause. Skip recitals, definitions and signature blocks.
- "redflag" is for terms that are genuinely unusual or punitive, not merely unfavourable. Use it sparingly.
- "quote" must be copied word for word from the contract. If you cannot copy it exactly, use "".
- Write plainly. No legalese in the "plain" and "why" fields.
- List between 2 and 6 missing protections that a contract of this type would normally have.

CONTRACT:
{contract_text}"""


def parse_json_block(raw):
    """Get a JSON object out of a model response that may be wrapped in prose."""
    if not raw:
        raise ValueError("empty response")

    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in response")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        raise ValueError("malformed JSON in response")


def _clean(value, limit):
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit]


def normalise_xray(parsed):
    """Coerce the model's JSON into the exact shape the front end expects."""
    if not isinstance(parsed, dict):
        parsed = {}

    clauses = []
    for item in (parsed.get("clauses") or [])[:MAX_CLAUSES]:
        if not isinstance(item, dict):
            continue
        plain = _clean(item.get("plain"), 400)
        heading = _clean(item.get("heading"), 60)
        if not plain or not heading:
            continue
        lean = _clean(item.get("lean"), 20).lower()
        clauses.append({
            "ref": _clean(item.get("ref"), 12),
            "heading": heading,
            "plain": plain,
            "lean": lean if lean in LEANS else "neutral",
            "why": _clean(item.get("why"), 240),
            "quote": _clean(item.get("quote"), 200),
        })

    missing = []
    for item in (parsed.get("missing") or [])[:MAX_GAPS]:
        if not isinstance(item, dict):
            continue
        label = _clean(item.get("item"), 80)
        if not label:
            continue
        missing.append({"item": label, "why": _clean(item.get("why"), 240)})

    parties = [_clean(p, 120) for p in (parsed.get("parties") or []) if _clean(p, 120)][:4]

    tally = {lean: 0 for lean in LEANS}
    for clause in clauses:
        tally[clause["lean"]] += 1

    return {
        "document_type": _clean(parsed.get("document_type"), 80) or "Agreement",
        "parties": parties,
        "summary": _clean(parsed.get("summary"), 400),
        "clauses": clauses,
        "missing": missing,
        "tally": tally,
    }
