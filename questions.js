/**
 * Group 11 — Minimalist Survey — Question Bank
 * ================================================
 * This file is DATA, not logic. survey.js reads it; it never edits it.
 * A non-programmer can safely: change wording (`prompt`, `label` fields),
 * add/remove/reorder items inside an `options` array, or flip `required`.
 * Do NOT rename a question's `id` — it is also the Google Sheet column name.
 *
 * DECISIONS CONFIRMED WITH THE GROUP (2026-08-02):
 *   1. Bare "Other" options (C1.1, B6, C2.2 — no "(specify)" in the doc) DO
 *      get a free-text box, capped at 200 chars, stored in a new column
 *      each: c1_1_other, b6_other, c2_2_other. Schema extended accordingly.
 *   2. The brand list's per-respondent shuffle order is reused everywhere
 *      the brand list appears — B1's per-row dropdowns, C1.7(b), etc. —
 *      not just A6/B3/B7/C2.3. One shuffle, reused everywhere.
 *   3. B1's dropdown uses the master brand list with "None of these"
 *      swapped for "Don't use this" (plus "Other (specify)" pinned last).
 *      B1 ALSO gets a free-text box per row when "Other (specify)" is
 *      picked, one new column per product row (e.g. b1_cleanser_other).
 *   4. A6 asks "Using now / Used before, stopped" for EVERY brand selected
 *      (not just Minimalist), stored as a semicolon-separated list in a
 *      new column `a6_brand_statuses` (format "Brand:Status;Brand:Status").
 *      `a6_minimalist_status` is kept as a derived convenience column
 *      (Minimalist's status, pulled out of a6_brand_statuses) since
 *      branch routing (R1/R2) needs it directly.
 *   5. A3's "Metro (Mumbai / Delhi NCR / ...)" is ONE dropdown option
 *      (the city list is illustrative, not seven separate options).
 *
 * STILL OPEN — not yet extended, flagging for a decision:
 *   - A6 also has "Other (specify)" (the multiselect brand list), and
 *     C2.1 shares C1.1's SKU_LIST (which has the same bare "Other").
 *     Both are structurally identical to the approved C1.1 pattern
 *     (multiselect + Other), so I extended the same text-capture
 *     treatment to them too: `a6_other` and `c2_1_other`. Flag if either
 *     should come back out.
 *   - B3, B7, C2.3, and C1.7(b) also offer "Other (specify)" but are
 *     single-brand dropdowns, not multiselects. I have NOT added text
 *     columns for these (out of scope of what was asked) — say the word
 *     if you want b3_other / b7_other / c2_3_other / c1_7_brand_other too.
 */

// ---------------------------------------------------------------------
// Shared option lists
// ---------------------------------------------------------------------

// Master brand list. Order is shuffled per respondent (seeded) at runtime,
// EXCEPT items with pin:'bottom', which always stay last, in this order.
const BRAND_LIST = [
  { value: "Minimalist" },
  { value: "Dot & Key" },
  { value: "The Derma Co" },
  { value: "Foxtale" },
  { value: "Plum" },
  { value: "Pilgrim" },
  { value: "mCaffeine" },
  { value: "Aqualogica" },
  { value: "Mamaearth" },
  { value: "Deconstruct" },
  { value: "Cetaphil" },
  { value: "CeraVe" },
  { value: "La Roche-Posay" },
  { value: "The Ordinary" },
  { value: "Klairs" },
  { value: "Kiehl's" },
  { value: "Neutrogena" },
  { value: "Other (specify)", pin: "bottom" },
  { value: "None of these", pin: "bottom" },
];

// Same list, for B1's per-row "which brand do you use" dropdowns —
// "None of these" doesn't fit a per-product-category question, so it's
// replaced with "Don't use this" (see assumption 3 above).
const BRAND_LIST_B1 = [
  ...BRAND_LIST.filter((o) => o.value !== "None of these"),
  { value: "Don't use this", pin: "bottom" },
];

// International brands — selecting any of these in A6 sets intl_brand_user.
const INTERNATIONAL_BRANDS = [
  "CeraVe",
  "La Roche-Posay",
  "The Ordinary",
  "Klairs",
  "Kiehl's",
  "Neutrogena",
];

// Minimalist SKU list — used by C1.1, C2.1, and the C1.7(a) follow-up.
const SKU_LIST = [
  "Niacinamide serum",
  "Vitamin C serum",
  "Salicylic Acid",
  "Retinol",
  "Sunscreen",
  "Moisturiser",
  "Face wash",
  "Toner",
  "Other",
];

// City/hometown tier list — used by A3's two dropdowns.
const TIER_LIST = [
  {
    value: "Metro",
    label:
      "Metro (Mumbai / Delhi NCR / Bengaluru / Hyderabad / Chennai / Kolkata / Pune)",
  },
  { value: "Tier-1 other" },
  { value: "Tier-2" },
  { value: "Tier-3 or smaller" },
  { value: "Outside India" },
];

// Three-word description list — used by C1.5, C2.5, and (extended) C3.2.
const WORD_LIST_CORE = [
  "Trustworthy",
  "Affordable",
  "Clinical",
  "Effective",
  "Transparent",
  "Premium",
  "Boring",
  "Overhyped",
  "Basic",
  "Scientific",
  "Honest",
];
const WORD_LIST_C3 = [...WORD_LIST_CORE, "No clear impression"];

// ---------------------------------------------------------------------
// Landing screen (verbatim — do not rephrase)
//
// NOTE (2026-08-03): name/email fields were added by explicit instruction,
// which reverses the original prompt's "hard constraint" no-PII policy
// ("Collect no name, email, phone number, or IP address") and the doc's
// "deliberately tuned" anonymity sentence. Both are optional and the copy
// below + D5's consent text were updated to match — flagging here since
// it's a real policy reversal, not just a wording tweak, in case it needs
// sign-off from anyone overseeing the study's ethics/consent posture.
// ---------------------------------------------------------------------
const landing = {
  title: "Skincare Habits — a short student survey",
  body: "This is a consumer survey by MBA students at IIM Bangalore, for a marketing project on Indian skincare. It takes about 5 minutes. Your responses are used only in aggregate for academic analysis. Name and email are optional.",
  buttonLabel: "Start survey",
  identityFields: {
    name: { maxLength: 60, placeholder: "Full name" },
    email: { maxLength: 80, placeholder: "you@example.com" },
    helperText: "Optional. Used only to verify authenticity of responses.",
  },
};

// ---------------------------------------------------------------------
// Under-18 hard-exit message (A1 = "Under 18")
// ---------------------------------------------------------------------
const under18Exit = {
  message:
    "Thanks for your interest — this survey is only for respondents aged 18 and over. No information has been saved.",
};

// ---------------------------------------------------------------------
// Section A — Screener and Profile (asked of everyone)
// ---------------------------------------------------------------------
const sectionA = [
  {
    id: "a1",
    section: "A",
    type: "single-select",
    prompt: "Your age",
    required: true,
    options: [
      { value: "Under 18", exitSurvey: true },
      { value: "18–24" },
      { value: "25–34" },
      { value: "35–44" },
      { value: "45+" },
    ],
  },
  {
    id: "a2",
    section: "A",
    type: "single-select",
    prompt: "Gender",
    required: true,
    options: [
      { value: "Male" },
      { value: "Female" },
      { value: "Prefer to self-describe" },
      { value: "Prefer not to say" },
    ],
  },
  {
    id: "a3_current",
    section: "A",
    type: "single-dropdown",
    prompt: "Where do you currently live?",
    required: true,
    optionsRef: "TIER_LIST",
  },
  {
    id: "a3_hometown",
    section: "A",
    type: "single-dropdown",
    prompt: "Where did you grow up?",
    required: true,
    optionsRef: "TIER_LIST",
  },
  {
    id: "a4",
    section: "A",
    type: "single-select",
    prompt: "Do you use any skincare products beyond soap and water?",
    required: true,
    options: [
      { value: "Yes, a regular routine" },
      { value: "Yes, occasionally" },
      { value: "No", routeToR0: true },
    ],
  },
  {
    id: "a5",
    section: "A",
    type: "single-select",
    prompt: "Roughly how much do you spend on skincare in a month?",
    required: true,
    showIf: { not: { field: "a4", equals: "No" } },
    options: [
      { value: "Under ₹500" },
      { value: "₹500–1,000" },
      { value: "₹1,000–2,000" },
      { value: "₹2,000–4,000" },
      { value: "Over ₹4,000" },
      { value: "Not sure" },
    ],
  },
  {
    id: "a6",
    section: "A",
    type: "multiselect-with-status-followup",
    prompt: "Which of these have you used in the last 12 months?",
    helperText: "Select all that apply.",
    required: true,
    showIf: { not: { field: "a4", equals: "No" } },
    optionsRef: "BRAND_LIST",
    shuffleGroup: "brandList",
    // "None of these" is exclusive of every other option (picking it clears
    // the rest, and picking anything else clears it).
    exclusiveValue: "None of these",
    // Status follow-up is asked for EVERY brand selected (except the
    // exclusive "None of these"). If "Other (specify)" is selected, the
    // status question is asked against whatever name was typed into
    // a6_other (falls back to the literal "Other" if left blank).
    statusFollowupOptions: ["Using now", "Used before, stopped"],
    otherTrigger: "Other (specify)",
    otherColumn: "a6_other",
    otherMaxLength: 200,
    columns: {
      selections: "a6_brands", // semicolon-separated
      // "Brand:Status;Brand:Status" — one pair per selected brand.
      statuses: "a6_brand_statuses",
      // Derived (not asked separately): Minimalist's entry pulled out of
      // a6_brand_statuses, kept because branch routing (R1/R2) needs it
      // directly without re-parsing the combined field.
      minimalistStatusDerived: "a6_minimalist_status",
    },
  },
  {
    id: "a7",
    section: "A",
    type: "single-select",
    prompt: "Have you heard of Minimalist?",
    required: true,
    showIf: {
      allOf: [
        { not: { field: "a4", equals: "No" } },
        { field: "a6_brands", notIncludes: "Minimalist" },
      ],
    },
    options: [
      { value: "Yes, know it well", routeToBranch: "R3" },
      { value: "Yes, heard the name", routeToBranch: "R3" },
      { value: "No", routeToBranch: "R4" },
    ],
  },
  {
    id: "a8",
    section: "A",
    type: "multiselect",
    prompt: "Where do you usually buy skincare?",
    helperText: "Select all that apply.",
    required: true,
    showIf: { not: { field: "a4", equals: "No" } },
    options: [
      { value: "Nykaa" },
      { value: "Amazon" },
      { value: "Flipkart" },
      { value: "Brand's own website or app" },
      { value: "Blinkit / Zepto / Instamart" },
      { value: "Beauty store (Nykaa store, Health & Glow)" },
      { value: "Local chemist" },
      { value: "Supermarket" },
      { value: "Dermatologist's clinic" },
    ],
  },
  {
    id: "a9",
    section: "A",
    type: "single-select",
    prompt: "What got you into skincare in the first place?",
    required: true,
    showIf: { not: { field: "a4", equals: "No" } },
    options: [
      { value: "A specific skin problem (acne, pigmentation, dryness)" },
      { value: "General grooming and appearance" },
      { value: "Someone recommended a routine" },
      { value: "Social media content" },
      { value: "Never thought about it, just picked things up" },
    ],
  },
];

// ---------------------------------------------------------------------
// Section B — Common Core (asked of everyone who uses skincare, R1–R4)
// ---------------------------------------------------------------------
const sectionB = [
  {
    id: "b1",
    section: "B",
    type: "matrix-dropdown",
    prompt: "For each product below, which brand do you currently use?",
    required: true,
    optionsRef: "BRAND_LIST_B1",
    shuffleGroup: "brandList",
    // Selecting "Other (specify)" in any row reveals a text box for that row.
    otherTrigger: "Other (specify)",
    otherMaxLength: 200,
    rows: [
      { label: "Face wash / cleanser", column: "b1_cleanser", otherColumn: "b1_cleanser_other" },
      { label: "Serum", column: "b1_serum", otherColumn: "b1_serum_other" },
      { label: "Moisturiser", column: "b1_moisturiser", otherColumn: "b1_moisturiser_other" },
      { label: "Sunscreen", column: "b1_sunscreen", otherColumn: "b1_sunscreen_other" },
      { label: "Toner", column: "b1_toner", otherColumn: "b1_toner_other" },
      { label: "Exfoliant or peel", column: "b1_exfoliant", otherColumn: "b1_exfoliant_other" },
    ],
  },
  {
    id: "b2",
    section: "B",
    type: "multiselect-then-rank",
    prompt: "How did you first discover the skincare brands you use?",
    helperText: "Select all that apply, then rank your top 2.",
    required: true,
    rankCount: 2,
    options: [
      { value: "Browsing Amazon / Nykaa" },
      { value: "Friend or family recommendation" },
      { value: "Instagram or YouTube influencer" },
      { value: "Dermatologist" },
      { value: "Reddit or online forums" },
      { value: "Brand's own ads" },
      { value: "Saw it in a store" },
      { value: "Quick-commerce app suggestion" },
    ],
    columns: { rank1: "b2_rank1", rank2: "b2_rank2" },
  },
  {
    id: "b3",
    section: "B",
    type: "single-dropdown",
    prompt:
      "Imagine every skincare brand cost exactly the same. Which one would you buy?",
    required: true,
    optionsRef: "BRAND_LIST",
    shuffleGroup: "brandList",
  },
  {
    id: "b4",
    section: "B",
    type: "single-select",
    prompt: "Why that one?",
    helperText: "Pick the closest.",
    required: true,
    doNotRandomize: true,
    options: [
      { value: "It tells you exactly what's inside and at what concentration" },
      { value: "The ingredients and formulation are simply better quality" },
      { value: "I already trust it / I've used it for years" },
      { value: "Doctors or dermatologists recommend it" },
      { value: "Reviews and word of mouth are strongest" },
      { value: "It's the brand I see most / feels most established" },
    ],
  },
  {
    id: "b5",
    section: "B",
    type: "single-select",
    prompt: "Do you use sunscreen regularly?",
    required: true,
    options: [
      { value: "Yes" },
      { value: "No" },
      { value: "Used to, stopped" },
    ],
  },
  {
    id: "b6",
    section: "B",
    type: "single-select",
    prompt:
      "Have you ever stopped using a sunscreen you'd bought? What was the main reason?",
    required: true,
    showIf: { field: "b5", in: ["Yes", "Used to, stopped"] },
    options: [
      { value: "Too heavy, greasy or sticky" },
      { value: "Caused breakouts" },
      { value: "White cast" },
      { value: "Didn't suit humid weather" },
      { value: "Too expensive" },
      { value: "Ran out and tried something else" },
      { value: "Never stopped one" },
      { value: "Other" },
    ],
    // "Other" reveals a text box, capped at 200 chars.
    otherTrigger: "Other",
    otherColumn: "b6_other",
    otherMaxLength: 200,
  },
  {
    id: "b7",
    section: "B",
    type: "single-dropdown",
    prompt: "Which brand's sunscreen was that?",
    required: true,
    showIf: {
      allOf: [
        { field: "b5", in: ["Yes", "Used to, stopped"] },
        { not: { field: "b6", equals: "Never stopped one" } },
      ],
    },
    optionsRef: "BRAND_LIST",
    shuffleGroup: "brandList",
  },
  {
    id: "b8",
    section: "B",
    type: "rank",
    prompt: "What frustrates you most when buying skincare?",
    helperText: "Rank your top 3.",
    required: true,
    rankCount: 3,
    options: [
      { value: "Too many options to choose from" },
      { value: "Can't tell real reviews from paid ones" },
      { value: "Brands list a hero ingredient that's barely present" },
      { value: "Hard to know what actually works for my skin" },
      { value: "Prices keep changing with discounts" },
      { value: "Products don't suit Indian weather" },
      { value: "Nothing much" },
    ],
    columns: {
      rank1: "b8_rank1",
      rank2: "b8_rank2",
      rank3: "b8_rank3",
    },
  },
];

// ---------------------------------------------------------------------
// Section C1 — Current Minimalist users (R1)
// ---------------------------------------------------------------------
const sectionC1 = [
  {
    id: "c1_1",
    section: "C1",
    type: "multiselect",
    prompt: "Which Minimalist products do you use?",
    required: true,
    optionsRef: "SKU_LIST",
    // "Other" reveals a text box, capped at 200 chars.
    otherTrigger: "Other",
    otherColumn: "c1_1_other",
    otherMaxLength: 200,
  },
  {
    id: "c1_2",
    section: "C1",
    type: "single-select",
    prompt: "How long have you been using Minimalist?",
    required: true,
    options: [
      { value: "Under 6 months" },
      { value: "6–12 months" },
      { value: "1–2 years" },
      { value: "2+ years" },
    ],
  },
  {
    id: "c1_3",
    section: "C1",
    type: "single-select",
    prompt: "How many times have you repurchased the same Minimalist product?",
    required: true,
    options: [
      { value: "First purchase" },
      { value: "Once" },
      { value: "2–4 times" },
      { value: "5 or more" },
    ],
  },
  {
    id: "c1_4",
    section: "C1",
    type: "scale-0-10",
    prompt: "How likely are you to recommend Minimalist to a friend?",
    helperText: "0 = Not at all likely, 10 = Extremely likely",
    required: true,
  },
  {
    id: "c1_5",
    section: "C1",
    type: "multiselect-exact",
    prompt: "Which three words describe Minimalist to you?",
    helperText: "Pick exactly 3.",
    required: true,
    exactCount: 3,
    optionsRef: "WORD_LIST_CORE",
  },
  {
    id: "c1_6",
    section: "C1",
    type: "text-short",
    prompt: "Is there any skincare product you wish Minimalist made but doesn't?",
    required: false,
    maxLength: 200,
  },
  {
    id: "c1_7",
    section: "C1",
    type: "single-select",
    prompt:
      "In the last year, have you moved any product from Minimalist to another brand?",
    required: true,
    options: [{ value: "Yes" }, { value: "No" }],
  },
  {
    id: "c1_7_product",
    section: "C1",
    type: "single-dropdown",
    prompt: "Which product?",
    required: true,
    showIf: { field: "c1_7", equals: "Yes" },
    optionsRef: "SKU_LIST",
  },
  {
    id: "c1_7_brand",
    section: "C1",
    type: "single-dropdown",
    prompt: "Which brand did you move to?",
    required: true,
    showIf: { field: "c1_7", equals: "Yes" },
    optionsRef: "BRAND_LIST",
    shuffleGroup: "brandList",
  },
];

// ---------------------------------------------------------------------
// Section C2 — Lapsed Minimalist users (R2)
// ---------------------------------------------------------------------
const sectionC2 = [
  {
    id: "c2_1",
    section: "C2",
    type: "multiselect",
    prompt: "Which Minimalist product did you stop using?",
    required: true,
    optionsRef: "SKU_LIST",
    // Same SKU_LIST as C1.1, so it inherits the same bare "Other" option —
    // extended the same text-capture treatment for consistency (flag if
    // this should come back out; it wasn't explicitly named in the ask).
    otherTrigger: "Other",
    otherColumn: "c2_1_other",
    otherMaxLength: 200,
  },
  {
    id: "c2_2",
    section: "C2",
    type: "single-select",
    prompt: "Main reason you stopped",
    required: true,
    options: [
      { value: "Didn't see results" },
      { value: "Caused irritation or breakouts" },
      { value: "Texture or feel I didn't like" },
      { value: "Found something cheaper" },
      { value: "Found something better at the same price" },
      { value: "Ran out and drifted away" },
      { value: "Packaging or experience" },
      { value: "Other" },
    ],
    // "Other" reveals a text box, capped at 200 chars.
    otherTrigger: "Other",
    otherColumn: "c2_2_other",
    otherMaxLength: 200,
  },
  {
    id: "c2_3",
    section: "C2",
    type: "single-dropdown",
    prompt: "What did you switch to?",
    required: true,
    optionsRef: "BRAND_LIST",
    shuffleGroup: "brandList",
  },
  {
    id: "c2_4",
    section: "C2",
    type: "single-select",
    prompt: "What would bring you back?",
    required: true,
    options: [
      { value: "A reformulated version" },
      { value: "Lower price" },
      { value: "A product they don't currently make" },
      { value: "Stronger proof it works" },
      { value: "Nothing, I've moved on" },
    ],
  },
  {
    id: "c2_5",
    section: "C2",
    type: "multiselect-exact",
    prompt: "Which three words describe Minimalist to you now?",
    helperText: "Pick exactly 3.",
    required: true,
    exactCount: 3,
    optionsRef: "WORD_LIST_CORE",
  },
];

// ---------------------------------------------------------------------
// Section C3 — Aware but never used (R3)
// ---------------------------------------------------------------------
const sectionC3 = [
  {
    id: "c3_1",
    section: "C3",
    type: "single-select",
    prompt: "What's stopped you from trying Minimalist?",
    required: true,
    options: [
      { value: "Happy with what I use" },
      { value: "Too expensive" },
      { value: "Not sure it suits my skin" },
      { value: "Don't know enough about it" },
      { value: "Never available where I shop" },
      { value: "Doesn't feel premium enough" },
      { value: "No particular reason" },
    ],
  },
  {
    id: "c3_2",
    section: "C3",
    type: "multiselect-exact",
    prompt: "Which three words describe Minimalist to you?",
    helperText: "Pick exactly 3.",
    required: true,
    exactCount: 3,
    optionsRef: "WORD_LIST_C3",
  },
  {
    id: "c3_3",
    section: "C3",
    type: "single-select",
    prompt: "What would make you try it?",
    required: true,
    options: [
      { value: "A dermatologist recommending it" },
      { value: "A friend's recommendation" },
      { value: "A trial or sample size" },
      { value: "A discount" },
      { value: "Seeing it in a store I already shop at" },
      { value: "Strong before-and-after evidence" },
    ],
  },
];

// ---------------------------------------------------------------------
// Section C4 — Unaware (R4)
// ---------------------------------------------------------------------
const sectionC4 = [
  {
    id: "c4_1",
    section: "C4",
    type: "single-select",
    prompt:
      "When you pick a skincare brand you've never used, what convinces you most?",
    required: true,
    options: [
      { value: "Ingredient list" },
      { value: "Price" },
      { value: "Reviews" },
      { value: "Dermatologist advice" },
      { value: "Friend's recommendation" },
      { value: "A brand I recognise" },
    ],
  },
  {
    id: "c4_2",
    section: "C4",
    type: "single-select",
    prompt:
      "Would you pay more for a brand that publishes exact ingredient concentrations?",
    required: true,
    options: [
      { value: "Yes, definitely" },
      { value: "Maybe" },
      { value: "No, doesn't matter to me" },
    ],
  },
];

// ---------------------------------------------------------------------
// Section D — Close (asked of everyone, R1–R4)
// ---------------------------------------------------------------------
const sectionD = [
  {
    id: "d1",
    section: "D",
    type: "single-select",
    prompt:
      "An Indian skincare brand launches a premium line — same transparency, stronger and better-researched formulations. What's the most you'd pay for a 30ml serum from it?",
    required: true,
    options: [
      { value: "Under ₹600" },
      { value: "₹600–1,000" },
      { value: "₹1,000–1,500" },
      { value: "₹1,500–2,500" },
      { value: "₹2,500–3,500" },
      { value: "I'd only buy an international brand at that price" },
    ],
  },
  {
    id: "d2",
    section: "D",
    type: "text-locked",
    prompt: "Do you know which company owns Minimalist?",
    helperText: "One line. This is an unaided awareness check.",
    required: false,
    maxLength: 200,
    lockOnSubmit: true, // cannot be edited/navigated-back-to once answered
  },
  {
    id: "d3",
    section: "D",
    type: "single-select",
    prompt:
      "Minimalist was acquired by Hindustan Unilever in 2025. Does knowing this change how you feel about the brand?",
    required: true,
    showIf: { field: "d2", locked: true },
    noBackNavigation: true, // cannot navigate back across the D2/D3 boundary
    options: [
      { value: "More positive — bigger company, more reliable" },
      { value: "No change" },
      { value: "Slightly negative — I liked that it was independent" },
      { value: "Strongly negative — I'd consider switching" },
      { value: "I didn't know, and I'm not sure yet" },
    ],
  },
  {
    id: "d4",
    section: "D",
    type: "text-short",
    prompt: "Anything else about Minimalist or skincare buying you'd want to add?",
    required: false,
    maxLength: 200,
  },
  {
    id: "d5_consent",
    section: "D",
    type: "consent",
    prompt:
      "This survey is for an academic project at IIM Bangalore. Any identifying information you provided is used only for verification and will not be shared or published. Analysis and reporting use responses in aggregate only.",
    checkboxLabel: "I understand and agree",
    required: true,
    showToR0: true, // shown even to respondents screened out at A4
  },
];

// ---------------------------------------------------------------------
// Derived profile flags — cross-tab variables, NEVER used for routing
// ---------------------------------------------------------------------
const derivedFlags = [
  {
    id: "intl_brand_user",
    description:
      "True if any of the international brands were selected in A6.",
    rule: { field: "a6_brands", includesAnyOf: INTERNATIONAL_BRANDS },
  },
  {
    id: "quick_commerce_buyer",
    description: "True if Blinkit / Zepto / Instamart was selected in A8.",
    rule: { field: "a8", includes: "Blinkit / Zepto / Instamart" },
  },
  {
    id: "grooming_led",
    description:
      "True if A9 = 'General grooming and appearance' AND A2 = 'Male'.",
    rule: {
      allOf: [
        { field: "a9", equals: "General grooming and appearance" },
        { field: "a2", equals: "Male" },
      ],
    },
  },
];

// ---------------------------------------------------------------------
// Branch → Section C map
// ---------------------------------------------------------------------
const branchToSectionC = {
  R1: sectionC1,
  R2: sectionC2,
  R3: sectionC3,
  R4: sectionC4,
  R0: [], // R0 skips Section B and C entirely
};

// ---------------------------------------------------------------------
// Fixed Google Sheet column order — exhaustive, never reordered.
// ---------------------------------------------------------------------
const columnOrder = [
  // Metadata
  "respondent_name", // optional, from the landing screen — empty string if not provided
  "respondent_email", // optional, from the landing screen — empty string if not provided
  "response_id",
  "submitted_at_ist",
  "branch",
  "completed",
  "duration_seconds",
  // Section A
  "a1",
  "a2",
  "a3_current",
  "a3_hometown",
  "a4",
  "a5",
  "a6_brands",
  "a6_other",
  "a6_brand_statuses",
  "a6_minimalist_status",
  "a7",
  "a8",
  "a9",
  // Section B
  "b1_cleanser",
  "b1_cleanser_other",
  "b1_serum",
  "b1_serum_other",
  "b1_moisturiser",
  "b1_moisturiser_other",
  "b1_sunscreen",
  "b1_sunscreen_other",
  "b1_toner",
  "b1_toner_other",
  "b1_exfoliant",
  "b1_exfoliant_other",
  "b2_rank1",
  "b2_rank2",
  "b3",
  "b4",
  "b5",
  "b6",
  "b6_other",
  "b7",
  "b8_rank1",
  "b8_rank2",
  "b8_rank3",
  // Section C1
  "c1_1",
  "c1_1_other",
  "c1_2",
  "c1_3",
  "c1_4",
  "c1_5",
  "c1_6",
  "c1_7",
  "c1_7_product",
  "c1_7_brand",
  // Section C2
  "c2_1",
  "c2_1_other",
  "c2_2",
  "c2_2_other",
  "c2_3",
  "c2_4",
  "c2_5",
  // Section C3
  "c3_1",
  "c3_2",
  "c3_3",
  // Section C4
  "c4_1",
  "c4_2",
  // Section D
  "d1",
  "d2",
  "d3",
  "d4",
  "d5_consent",
  // Derived flags
  "intl_brand_user",
  "quick_commerce_buyer",
  "grooming_led",
  // Audit
  "shuffle_seed",
];

// ---------------------------------------------------------------------
// Export (UMD-ish: works as a browser global AND as a Node require())
// ---------------------------------------------------------------------
const QUESTIONS = {
  landing,
  under18Exit,
  brandList: BRAND_LIST,
  brandListB1: BRAND_LIST_B1,
  skuList: SKU_LIST,
  tierList: TIER_LIST,
  wordListCore: WORD_LIST_CORE,
  wordListC3: WORD_LIST_C3,
  internationalBrands: INTERNATIONAL_BRANDS,
  sections: {
    A: sectionA,
    B: sectionB,
    C1: sectionC1,
    C2: sectionC2,
    C3: sectionC3,
    C4: sectionC4,
    D: sectionD,
  },
  branchToSectionC,
  derivedFlags,
  columnOrder,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = QUESTIONS;
} else {
  window.QUESTIONS = QUESTIONS;
}
