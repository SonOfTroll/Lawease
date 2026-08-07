# LawEase

**Making legal documents legible to the people who have to sign them.**

LawEase is a Flask application with four tools: a clause-by-clause contract
reader, an evidence-grounded case lookup, a document generator, and a legal
Q&A assistant.

---

## 1. The problem this project actually attacks

Most "AI + law" projects answer the lawyer's question: *help me draft faster*.
The person who actually needs help is on the other side of the table — the
freelancer, the tenant, the first employee — who has been handed a document
written by someone else's lawyer and has no way to know what it says.

That reframing drives everything below.

---

## 2. Novelty — three specific claims

If someone asks "what's new here, an LLM could do this," these are the three
answers. Each is a design and engineering decision, not a prompt.

### 2.1 Absence detection: naming the clauses that are *not* there

`utils/contract_xray.py`, `/api/xray`

Every contract-analysis tool on the market classifies **what is present**:
segment the document, label each clause, flag the risky ones. That is a
retrieval and classification problem, and it is well covered.

LawEase also reports **what is missing**. It compares the document against
the protections a contract of that type would normally carry, and returns a
`missing[]` list — a liability cap, a carve-out for information already
public, mutuality of obligations — each with a plain sentence on what the
reader is exposed to without it.

**Why this is not trivial:** you cannot find an absence by scanning text.
There is no span to point at, no embedding to match, no classifier that fires.
The system has to hold a model of what *should* be in a document of this class
and diff the real document against it. Present-clause analysis is extraction;
absence analysis is reasoning over a schema. In practice the omitted clause is
where the money is — an unlimited indemnity hurts you because a liability cap
is *absent*, not because the indemnity clause is unusual.

The output is also **stance-relative**: you name which party you are, and each
clause is scored `yours / neutral / theirs / redflag` from where *you* stand.
The same indemnity clause is a win for one side and a red flag for the other.
A stance-free "risk score" cannot express that.

### 2.2 Evidence-grounded prediction instead of an opaque score

`app.py: find_precedents(), explain_prediction()`, `/api/predict`

The original project returned a bare number: "62% petitioner." That is
unfalsifiable and unusable — you cannot check it, argue with it, or learn
anything from it.

Three layers now sit under every prediction:

| Layer | Method | What it gives the user |
|---|---|---|
| **Nearest precedents** | Cosine similarity (k=5) over the *same* L2-normalised TF-IDF space the classifier was fitted on, precomputed into `precedent_index.pkl` | Five real decided cases, with live Oyez links and how each actually went |
| **Feature attribution** | Per-token contribution to the log-odds: `coef[j] × tfidf[j]` decomposed over the input's non-zero features | The exact words that moved the prediction, in each direction |
| **Base-rate calibration** | Corpus prior (64.8% first-party win rate) drawn as a tick mark on the probability bar | Whether this prediction is meaningfully different from an average case |

Reusing the classifier's own vector space for retrieval is the key move: the
retrieved cases are neighbours *in the space the model reasons in*, so they
explain the model rather than merely accompanying it.

### 2.3 A measured negative result, reported in the interface

`train_outcome.py` computes and stores holdout accuracy alongside the model.

| Metric | Value |
|---|---|
| Corpus | 3,303 US Supreme Court cases (`justice.csv`) |
| Model | TF-IDF (2,000 features) → Logistic Regression |
| Holdout accuracy | **62.6%** |
| Majority-class baseline | **64.8%** |
| **Verdict** | **The model does not beat always guessing "petitioner wins."** |

Most student projects report the 62.6% and stop. Comparing it to the majority
baseline is what turns a number into a finding — and the finding is that
**this model has no predictive skill**, because case outcomes are not
recoverable from bag-of-words features over fact summaries.

Tab D of the site states this in plain language and tells the user to read the
retrieved cases and ignore the percentage. Building a system that argues
against its own headline number is a deliberate design position, and it is why
§2.2 exists: the retrieval layer is the part that carries real information.

---

## 3. Architecture

```
Browser ── static/script.js (vanilla, no framework)
   │
   ├── POST /api/xray      → Cohere command-r-plus → JSON → normalise_xray()
   ├── POST /api/predict   → LogReg + kNN over precedent_index.pkl
   ├── POST /api/classify  → LogReg over TF-IDF → Book1.csv lookup
   ├── POST /api/docgen    → Google Sheets → Google Docs → PDF → email
   └── POST /chat          → Cohere command-r-plus
```

**Boot-time artefacts** (all loaded once, no training at request time):

| File | Purpose |
|---|---|
| `outcome_model.pkl`, `outcome_vectorizer.pkl` | Outcome classifier |
| `precedent_index.pkl` | 3,303 × 2,000 sparse float32 matrix + case metadata + calibration stats |
| `Layer/case_category_model.pkl`, `Layer/tfidf_vectorizer.pkl` | Area-of-law classifier |

`precedent_index.pkl` stores the matrix as **float32** and relies on
TfidfVectorizer's built-in L2 row normalisation, so similarity is a plain dot
product — no normalisation at request time, and the artefact is 1.4 MB instead
of ~3 MB. This keeps serverless cold boots viable.

**Robustness.** `parse_json_block()` recovers JSON from a model response
wrapped in prose or markdown fences; `normalise_xray()` coerces the result into
a fixed shape and drops anything malformed, so the front end never has to
defend itself against a bad generation.

---

## 4. Bugs found and fixed

Worth mentioning in a viva — these are debugging results, not features.

1. **Inverted predictions.** `predict_proba()[0]` is P(class 0) = P(petitioner
   *lost*), but it was being returned as `"petitioner"`. Every prediction the
   system had ever made was backwards. Roe v. Wade returned 30% petitioner; it
   now correctly returns 75%. Fixed by indexing through `model.classes_`.
2. **Dead classification endpoint.** `app.py` loaded
   `case_category_model.pkl` from the project root, but the file only exists in
   `Layer/`. `/api/classify` returned 503 on every request in production. Fixed
   with a path resolver that checks both locations.
3. **Model artefacts excluded from deployment.** `.gitignore` contained
   `*.pkl`, so a fresh clone had no models. Fixed with explicit negations.

---

## 5. Interface

Direction: **the case file.** Every visual device comes from a physical Indian
court file rather than from generic dashboard design — oxblood binding tape
punched down the left edge (court files are literally tied in red tape; that is
where the phrase comes from), lettered index tabs cut into the outer edge, and
a pleading-paper double rule down the margin. Typeset in Newsreader (display),
Public Sans (body) and Spline Sans Mono (references and figures).

The hero is the product demonstrating itself: a real indemnity clause with its
annotations writing themselves in on load. That is the only animation on the
page, and it respects `prefers-reduced-motion`.

Light and dark are the same file read by day or under a desk lamp; the theme
persists in `localStorage`, follows `prefers-color-scheme` on first visit, and
is applied before first paint so the page never flashes.

---

## 6. Running it

```bash
pip install -r requirements.txt

# .env
COHERE_API_KEY=...            # Contract X-Ray + chat
GMAIL_SENDER=...              # document delivery
GMAIL_APP_PASSWORD=...

python train_outcome.py       # regenerates all three .pkl artefacts
python app.py                 # http://127.0.0.1:5001
```

`train_outcome.py` prints the holdout accuracy and the majority baseline, so
the §2.3 result reproduces in one command.

---

## 7. Viva preparation

**"An AI could build this."**
An LLM can label the clauses that are present — that part is a solved problem.
The three contributions are architectural decisions that sit around the model,
not inside it: (a) absence detection requires a schema of expected protections
to diff against, because there is no text span to retrieve; (b) grounding the
prediction in neighbours drawn from the classifier's *own* vector space is what
makes the retrieved cases explanatory rather than decorative; (c) measuring the
model against its majority baseline and then publishing the negative result is
an evaluation decision no generative step produces on its own.

**"So the whole thing is just an API call to Cohere."**
One of four features uses a language model. Prediction, retrieval, attribution,
calibration and classification are all scikit-learn running locally on a
3,303-case corpus. And the LLM output is not trusted: it is forced into a fixed
JSON schema, parsed defensively, coerced, and truncated before it reaches the
interface.

**"Your accuracy is only 62.6%."**
Correct, and that is the finding. The majority baseline is 64.8%, so the model
has no skill, and I say so in Tab D. Bag-of-words features over fact summaries
do not carry outcome signal — the fact summaries are written *after* the
decision and are deliberately neutral. This is why the system leads with
retrieved precedents rather than the probability. Reporting a number without
its baseline would have been the weaker project.

**"Why US Supreme Court data for an Indian tool?"**
Because it is the only large corpus with facts, parties and outcomes jointly
labelled and openly licensed. I state the mismatch in Tab D rather than hiding
it. Retraining on Indian Kanoon judgments is the obvious next step and needs a
scraping and labelling pipeline that is a project in itself.

**"How do you know the missing-clause list is right?"**
I don't guarantee it, and the interface says so: every flag is framed as a
question to ask, not a finding. That framing is the honest position for a
system with no ground-truth evaluation set for omissions. Building one — a
corpus of contracts annotated for absent protections — is the natural
extension, and to my knowledge no public dataset of that kind exists.

**"What would you do next?"**
Three things, in order: (1) an annotated evaluation set for absence detection,
since that is the claim with the weakest evidence; (2) retrain the outcome
model on Indian judgments with features beyond bag-of-words — court, bench,
statute cited, procedural posture — where the baseline is actually beatable;
(3) span-level highlighting that maps each finding back to the exact characters
in the uploaded document.

---

## 8. Limitations

- Not legal advice; no advocate–client relationship.
- Case outcome model has **no predictive skill** (§2.3). Use the retrieved
  precedents.
- Precedents and area-of-law labels are **US**, not Indian.
- Contract X-Ray runs on a language model: it misses things and can be
  confidently wrong.
- Scanned PDFs without a text layer are rejected; there is no OCR.
- Contracts are truncated at 18,000 characters, and the interface says when
  truncation happened.
