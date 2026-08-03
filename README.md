# Group 11 — Minimalist Survey

A short, mobile-first, branching consumer survey for an IIM Bangalore Marketing
Management project on the skincare brand Minimalist. Plain HTML/CSS/JS, no
framework, no build step.

- **Live survey:** https://webapp-pi-plum.vercel.app
- **Apps Script Web App (backend):** `https://script.google.com/macros/s/AKfycbx5ogxawkUnuXJTMF8RTNXEteJGgG9IjEEnkD_0ZIyckg1humKKqB0o89gY3A88O8bVXQ/exec`
- **Google Sheet ID:** `1UPG_d485xiS1yhNV6Itet0ZpFXYmJ9UqPx03TbL3dTw`
- **Testing:** all five branches (R0–R4) were run end-to-end through the real UI and confirmed writing correctly to the sheet on 2026-08-03.

## What's in this repo

```
index.html          shell, single page
styles.css           all styling
questions.js          question bank + routing rules — the file to edit if wording/options change
survey.js             renderer, routing engine, submission logic
apps-script/Code.gs   Google Apps Script backend (record-keeping copy of what's deployed)
scripts/validate-questions.js   checks questions.js against the sheet schema; run before any edit goes live
```

## Editing the survey (no coding needed)

Almost everything a non-developer would want to change lives in **`questions.js`**:
wording, answer options, whether a question is required, character limits. Find
the question by its id (e.g. `b4`, `c1_5`) and edit the `prompt` or `options`
fields directly. Don't rename a question's `id` — it doubles as the column
name in the Google Sheet.

After editing `questions.js`, run the validator to make sure nothing broke:

```bash
node scripts/validate-questions.js
```

It checks that every branch is reachable, every column in the sheet schema
has a question that can fill it (and vice versa), and prints the exact
question sequence for each of the five branches (R0–R4) so you can eyeball
the routing without clicking through it by hand.

## How the pieces fit together

1. **Google Sheet** — one row per respondent, one column per question (74
   columns total, fixed order — see `columnOrder` in `questions.js`).
2. **Apps Script Web App** — a small backend deployed from `apps-script/Code.gs`
   directly into the Sheet (Extensions → Apps Script), that appends a row on
   `doPost` and answers a health check on `doGet`. It's already deployed; the
   URL above is the only thing the frontend needs to know about it.
3. **Frontend** (`index.html` + `styles.css` + `questions.js` + `survey.js`) —
   a static site with no server of its own. It POSTs directly to the Apps
   Script URL when a respondent submits.
4. **Vercel** — hosts the static frontend. Zero-config: it's just static
   files, no build step, no environment variables.

## Redeploying the Apps Script backend (only if it ever needs to change)

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Paste the contents of `apps-script/Code.gs` in, replacing what's there.
3. **Deploy → Manage deployments → Edit (pencil icon) → New version → Deploy.**
   (Creating a brand-new deployment instead of a new version of the existing
   one will change the URL — don't do that unless you mean to, since the
   frontend's `APPS_SCRIPT_URL` constant in `survey.js` would need updating
   too.)
4. Confirm the health check: open the Web App URL directly in a browser: you
   should see `{"ok":true,"service":"group11-survey", ...}`.

## Redeploying the frontend

Push to the `main` branch — Vercel is connected to this GitHub repo and
redeploys automatically on every push. No build step, no config.

## Privacy note

The landing screen collects an **optional** name and email, used only to
verify authenticity of responses (see the consent screen for the exact
wording shown to respondents). No IP address, phone number, or other
identifying data is collected. Nothing is tracked — there is no analytics
script anywhere in this repo, and none should be added.
