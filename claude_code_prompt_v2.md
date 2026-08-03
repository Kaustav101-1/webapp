# Claude Code Prompt — Group 11 Minimalist Survey (v2)

> **How to use:** open Claude Code in an empty folder, attach `Group11_Survey_Questionnaire_v2.docx` to the session, then paste everything below the line.

---

Build a mobile-first branching survey web app. I've attached `Group11_Survey_Questionnaire_v2.docx` — read it first. It is the authoritative source for all question wording, answer options, and routing logic. Do not paraphrase, reorder, or "improve" any question text; transcribe it exactly as written. If anything in the doc is ambiguous, ask me before guessing.

## Context

This is an academic consumer survey for an IIM Bangalore marketing project on the skincare brand Minimalist. Target respondents are Indian consumers aged 18+, mostly on mobile, reached via WhatsApp. We need 100–150 completed responses. The survey must feel fast and trustworthy — if it looks like a phishing page or takes more than 5 minutes, people abandon it.

## Stack — keep it deliberately boring

- **Frontend:** a single static page. Vanilla HTML + CSS + JavaScript, no framework, no build step, no npm dependencies. One `index.html`, one `styles.css`, one `survey.js`, one `questions.js` (the question bank as a data structure).
- **Backend:** none. The form POSTs to a Google Apps Script Web App that appends a row to a Google Sheet.
- **Hosting:** Vercel, deployed from a GitHub repo. Zero-config static deployment.
- **Node:** used only for a local dev server and a small validation script. Not at runtime.

Do not introduce React, Next.js, Tailwind, a database, or serverless functions. If you think one is needed, tell me why before adding it.

## Architecture

```
/
├── index.html          # shell, single page
├── styles.css
├── questions.js        # question bank + routing rules as data
├── survey.js           # renderer, routing engine, submission
├── apps-script/
│   └── Code.gs         # Google Apps Script backend (I paste this into script.google.com)
├── scripts/
│   └── validate-questions.js   # node script: checks every branch is reachable, no orphan questions
├── vercel.json
└── README.md           # setup + deploy steps written for a non-developer
```

**Separate the question bank from the engine.** `questions.js` should be a plain data structure that a non-programmer on my team can edit — change wording, add an option, reorder — without touching `survey.js`. This matters; my groupmates will want edits and they don't code.

## Landing screen

Before Q A1, show a landing screen with:

- **Title:** "Skincare Habits — a short student survey"
- **Body copy, verbatim:** *"This is an anonymous consumer survey by MBA students at IIM Bangalore, for a marketing project on Indian skincare. It takes about 5 minutes. We do not collect your name, email, phone number or IP address. Responses are used only in aggregate."*
- **A single button:** "Start survey"

Write those words exactly — do not rephrase, expand, or "polish" them. The anonymity assurance affects response rates and the sentence has been deliberately tuned.

## Routing logic

The doc's "Design Logic" section is the spec. Implement it exactly:

- Everyone sees **Section A** (screener/profile) and **Section B** (common core).
- The branch is **derived, never asked**. Respondents are never shown a question like "which type of buyer are you?"
- Derivation rules from Section A:
  - A6 has Minimalist marked "Using now" → **R1** → Section C1
  - A6 has Minimalist marked "Used before, stopped" → **R2** → Section C2
  - Minimalist not in A6, and A7 = "know it well" or "heard the name" → **R3** → Section C3
  - Minimalist not in A6, and A7 = "No" → **R4** → Section C4
  - A4 = "No" → **R0** → skip everything, show D5 consent only, then the thank-you screen
  - A1 = "Under 18" → hard exit immediately, discard any data collected, show a polite message. Do not submit a row.
- After Section C, everyone (R1–R4) sees **Section D**.
- A7 is shown only when Minimalist was not selected in A6.
- **B5 = No** → skip **both B6 and B7** and go straight to B8.
- **B5 = Yes or "Used to, stopped"** → show B6.
- **B7 is shown only when B6 has been shown AND B6 ≠ "Never stopped one".**
- **C1.7 = Yes** → show two follow-up fields: (a) product dropdown from Minimalist SKU list matching C1.1, (b) brand dropdown from the full brand list. If C1.7 = No, skip both.

Also compute and store three derived profile flags, per the "Derivation" callouts in the doc: `intl_brand_user`, `quick_commerce_buyer`, `grooming_led`. These are **profile variables for cross-tabs, not routing** — do not branch on them.

## Behaviour requirements

**Randomisation.** The brand list (used in A6, B3, B7, C2.3) must be shuffled per respondent. "Other (specify)" and "None of these" always pin to the bottom regardless of shuffle. Store the seed so the shuffle is reproducible if we need to audit it. Do not randomise anything else — the answer options in B4, B8, C2.2 etc. are ordered deliberately.

**D2 → D3 sequencing.** D2 (unaided: "do you know who owns Minimalist?") must be locked before D3 (which reveals the HUL answer) is rendered. Once D2 is submitted, the respondent cannot navigate back and edit it. This is the whole point of the question pair — if they can go back, the unaided data is worthless.

**Navigation.** One section per screen, with a Back button — except across the D2/D3 boundary, and except back into a branch after it's been determined. A progress bar showing approximate position (percentage, not "question 7 of 24", since the count varies by branch).

**Validation.** Every question is required unless the doc marks it optional. Rank questions (B2 top 2, B8 top 3) must enforce the exact count. C1.5 / C2.5 / C3.2 must enforce exactly 3 words selected. Open text fields cap at 200 characters. Show inline errors, never an alert().

**Resume.** Save progress to `localStorage` on every answer so a respondent who closes the tab can resume. Clear it on successful submission.

**Duplicate protection.** Set a flag in `localStorage` after submission and show "you've already responded" on revisit. Deliberately soft — do not fingerprint, do not use cookies, do not block anyone determined to resubmit.

## Data and privacy

Hard constraints — we have a declared no-PII policy with our institution:

- Collect **no** name, email, phone number, or IP address.
- Do **not** add Google Analytics, Meta Pixel, Vercel Analytics, or any third-party script.
- Generate a random `response_id` (UUID) client-side purely to de-duplicate rows.
- The D5 consent checkbox must be ticked before the submit button enables.

**Sheet schema — one row per respondent, one column per question, flat.** No JSON blobs in cells; we're pivoting this in Excel.

**Column order — fixed and exhaustive.** Every respondent's row uses this exact column order. Branches a respondent did not see leave those columns as empty cells (not "N/A", not "null", not "-"):

Metadata (5):
`response_id`, `submitted_at_ist`, `branch`, `completed`, `duration_seconds`

Section A (11):
`a1`, `a2`, `a3_current`, `a3_hometown`, `a4`, `a5`, `a6_brands`, `a6_minimalist_status`, `a7`, `a8`, `a9`

Section B (10):
`b1_cleanser`, `b1_serum`, `b1_moisturiser`, `b1_sunscreen`, `b1_toner`, `b1_exfoliant`, `b2_rank1`, `b2_rank2`, `b3`, `b4`, `b5`, `b6`, `b7`, `b8_rank1`, `b8_rank2`, `b8_rank3`

Section C1 — Current users (7 + 2 follow-ups):
`c1_1`, `c1_2`, `c1_3`, `c1_4`, `c1_5`, `c1_6`, `c1_7`, `c1_7_product`, `c1_7_brand`

Section C2 — Lapsed (5):
`c2_1`, `c2_2`, `c2_3`, `c2_4`, `c2_5`

Section C3 — Aware, never used (3):
`c3_1`, `c3_2`, `c3_3`

Section C4 — Unaware (2):
`c4_1`, `c4_2`

Section D (5):
`d1`, `d2`, `d3`, `d4`, `d5_consent`

Derived flags (3):
`intl_brand_user`, `quick_commerce_buyer`, `grooming_led`

Audit (1):
`shuffle_seed`

Multi-select answers are semicolon-separated in a single cell. Ranked answers use one column per rank position, already reflected above (`b2_rank1`, `b2_rank2`, `b8_rank1..3`).

## Apps Script backend

Write `apps-script/Code.gs` with a `doPost` that appends to the sheet, plus a `doGet` returning a health-check string so I can verify deployment.

**Critical CORS detail:** Apps Script Web Apps do not handle CORS preflight. The client must POST with `Content-Type: text/plain;charset=utf-8` and a JSON string body — this makes it a "simple request" that skips preflight entirely. Do not set `application/json`, and do not reach for `mode: 'no-cors'` as a workaround, because we need to read the response to confirm the write succeeded. Parse the body with `JSON.parse(e.postData.contents)` inside `doPost`.

Have `Code.gs` create the header row automatically on first write if the sheet is empty, so column order can never drift from the client.

Handle submission failure properly: retry twice with backoff, and if it still fails, show the respondent a "couldn't save — please tap retry" state rather than a false thank-you. Keep their answers in localStorage until a write is confirmed.

## Design

Clean, plain, institutional. Not a startup landing page. System font stack, generous line height, high contrast, minimum 16px inputs so iOS doesn't zoom on focus. Tap targets at least 44px. Works down to a 320px viewport. No animations beyond a simple fade between sections.

## Deliverables

1. The working app, tested by clicking through **all five paths** (R0–R4) end to end.
2. `scripts/validate-questions.js` — a Node script that reads `questions.js` and asserts: every branch is reachable, no question is orphaned, every conditional references a question that exists, and every question has a unique column name matching the sheet schema above. Run it and show me it passes.
3. `README.md` written so a non-developer can follow it: how to create the Google Sheet, paste and deploy the Apps Script (including setting access to "Anyone"), copy the Web App URL into the config, push to GitHub, and connect Vercel.
4. A single `config.js` or clearly marked constant at the top of `survey.js` holding the Apps Script URL, so I can swap it without hunting.

## Working style

Build it in this order and pause after each for me to check: (1) `questions.js` question bank transcribed from the doc, (2) routing engine plus the validation script, (3) UI and styling, (4) Apps Script and submission, (5) full path testing. Don't build all five and present a finished thing — I want to catch a wording error at step 1, not step 5.
