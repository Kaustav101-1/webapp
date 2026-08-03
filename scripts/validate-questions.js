#!/usr/bin/env node
/**
 * Validates questions.js against the fixed sheet schema and the routing
 * engine (survey.js), then prints the deterministic branch paths.
 *
 * Exit code 0 = all checks passed. Exit code 1 = at least one failed;
 * failures are listed, and branch paths are NOT printed (they'd be
 * printing a broken model).
 *
 * Run: node scripts/validate-questions.js
 */
"use strict";

const path = require("path");
const QUESTIONS = require(path.join("..", "questions.js"));
const Survey = require(path.join("..", "survey.js"));

const failures = [];
const check = (name, condition, detail) => {
  if (!condition) failures.push({ name, detail });
};

const ALL_QUESTIONS = [
  ...QUESTIONS.sections.A,
  ...QUESTIONS.sections.B,
  ...QUESTIONS.sections.C1,
  ...QUESTIONS.sections.C2,
  ...QUESTIONS.sections.C3,
  ...QUESTIONS.sections.C4,
  ...QUESTIONS.sections.D,
];

// ===================================================================
// 1. Every question id is unique
// ===================================================================
{
  const seen = new Map();
  for (const q of ALL_QUESTIONS) {
    seen.set(q.id, (seen.get(q.id) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  check("Question ids are unique", dupes.length === 0, `Duplicate ids: ${dupes.join(", ")}`);
}

// ===================================================================
// 2. columnOrder has no duplicate entries
// ===================================================================
{
  const seen = new Map();
  for (const col of QUESTIONS.columnOrder) seen.set(col, (seen.get(col) || 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([col]) => col);
  check("columnOrder has no duplicate columns", dupes.length === 0, `Duplicate columns: ${dupes.join(", ")}`);
}

// ===================================================================
// 3. Bidirectional column <-> question reachability
// ===================================================================
const ENGINE_ONLY_COLUMNS = new Set([
  "respondent_name", // landing-screen field, not a question object
  "respondent_email", // landing-screen field, not a question object
  "response_id",
  "submitted_at_ist",
  "branch",
  "completed",
  "duration_seconds",
  "shuffle_seed",
  ...QUESTIONS.derivedFlags.map((f) => f.id),
]);

const columnProducers = new Map(); // column -> [questionId, ...]
for (const q of ALL_QUESTIONS) {
  let cols;
  try {
    cols = Survey.getProducedColumns(q);
  } catch (err) {
    failures.push({ name: `getProducedColumns(${q.id})`, detail: err.message });
    continue;
  }
  for (const col of cols) {
    if (!columnProducers.has(col)) columnProducers.set(col, []);
    columnProducers.get(col).push(q.id);
  }
}

{
  // 3a. Every column in the schema can be populated by some question
  //     (or is one of the fixed engine-only columns).
  const schemaOrphans = QUESTIONS.columnOrder.filter(
    (col) => !ENGINE_ONLY_COLUMNS.has(col) && !columnProducers.has(col)
  );
  check(
    "Every schema column has a producing question",
    schemaOrphans.length === 0,
    `Columns with no question producing them: ${schemaOrphans.join(", ")}`
  );

  // 3b. Every question's declared output column(s) exist in the schema.
  const questionOrphans = [];
  for (const [col, qids] of columnProducers) {
    if (!QUESTIONS.columnOrder.includes(col)) questionOrphans.push(`${col} (from ${qids.join(", ")})`);
  }
  check(
    "Every question's output column exists in the schema",
    questionOrphans.length === 0,
    `Columns produced but not in columnOrder: ${questionOrphans.join("; ")}`
  );

  // 3c. No column is produced by more than one question — would indicate
  //     schema drift (two questions silently overwriting the same cell).
  const collisions = [...columnProducers.entries()].filter(([, qids]) => qids.length > 1);
  check(
    "No column is produced by more than one question",
    collisions.length === 0,
    collisions.map(([col, qids]) => `${col} <- ${qids.join(", ")}`).join("; ")
  );
}

// ===================================================================
// 4. Every showIf / derived-flag condition references a real field
// ===================================================================
{
  const knownFields = new Set([...columnProducers.keys(), ...ALL_QUESTIONS.map((q) => q.id)]);
  const badRefs = [];

  for (const q of ALL_QUESTIONS) {
    if (!q.showIf) continue;
    for (const field of Survey.collectFields(q.showIf)) {
      if (!knownFields.has(field)) badRefs.push(`${q.id}.showIf -> "${field}"`);
    }
  }
  for (const flag of QUESTIONS.derivedFlags) {
    for (const field of Survey.collectFields(flag.rule)) {
      if (!knownFields.has(field)) badRefs.push(`derivedFlags.${flag.id}.rule -> "${field}"`);
    }
  }
  check("Every condition references a real field", badRefs.length === 0, badRefs.join("; "));
}

// ===================================================================
// 5. Every question is reachable on at least one branch's path
// ===================================================================
{
  const reachable = new Set();
  for (const branch of Survey.BRANCHES) {
    for (const entry of Survey.getPathForBranch(branch)) reachable.add(entry.id);
  }
  const unreachable = ALL_QUESTIONS.filter((q) => !reachable.has(q.id)).map((q) => q.id);
  check(
    "Every question is reachable on at least one branch",
    unreachable.length === 0,
    `Never shown on any branch: ${unreachable.join(", ")}`
  );
}

// ===================================================================
// 6. Branch derivation produces the branch it claims to, from realistic
//    answers (exercises the actual routing logic, not just the printer's
//    static facts table).
// ===================================================================
{
  const cases = [
    { label: "Under-18 hard exit", answers: { a1: "Under 18", a4: "Yes, a regular routine" }, expect: "EXIT_UNDER18" },
    { label: "R0 category non-user", answers: { a1: "25–34", a4: "No" }, expect: "R0" },
    {
      label: "R1 current user",
      answers: { a1: "25–34", a4: "Yes, a regular routine", a6_statuses: { Minimalist: "Using now" } },
      expect: "R1",
    },
    {
      label: "R2 lapsed user",
      answers: { a1: "25–34", a4: "Yes, a regular routine", a6_statuses: { Minimalist: "Used before, stopped" } },
      expect: "R2",
    },
    {
      label: "R3 aware, never used (knows it well)",
      answers: { a1: "25–34", a4: "Yes, a regular routine", a6_statuses: {}, a7: "Yes, know it well" },
      expect: "R3",
    },
    {
      label: "R3 aware, never used (heard the name)",
      answers: { a1: "25–34", a4: "Yes, a regular routine", a6_statuses: {}, a7: "Yes, heard the name" },
      expect: "R3",
    },
    {
      label: "R4 unaware",
      answers: { a1: "25–34", a4: "Yes, a regular routine", a6_statuses: {}, a7: "No" },
      expect: "R4",
    },
  ];
  const wrong = cases
    .map((c) => ({ ...c, actual: Survey.deriveBranch(c.answers) }))
    .filter((c) => c.actual !== c.expect);
  check(
    "deriveBranch() resolves every scripted case correctly",
    wrong.length === 0,
    wrong.map((c) => `${c.label}: expected ${c.expect}, got ${c.actual}`).join("; ")
  );
}

// ===================================================================
// 7. Rank / exact-count sanity (counts must fit within their option list)
// ===================================================================
{
  const problems = [];
  const rankQuestions = ALL_QUESTIONS.filter((q) => q.type === "rank" || q.type === "multiselect-then-rank");
  for (const q of rankQuestions) {
    if (q.rankCount > q.options.length) {
      problems.push(`${q.id}: rankCount ${q.rankCount} > ${q.options.length} options`);
    }
  }
  const exactQuestions = ALL_QUESTIONS.filter((q) => q.type === "multiselect-exact");
  for (const q of exactQuestions) {
    const list = QUESTIONS[toCamelListName(q.optionsRef)];
    if (!list) {
      problems.push(`${q.id}: optionsRef "${q.optionsRef}" not found on QUESTIONS`);
      continue;
    }
    if (q.exactCount > list.length) {
      problems.push(`${q.id}: exactCount ${q.exactCount} > ${list.length} options in ${q.optionsRef}`);
    }
  }
  check("Rank/exact-count questions fit their option lists", problems.length === 0, problems.join("; "));
}

function toCamelListName(constName) {
  // WORD_LIST_CORE -> wordListCore, matches the QUESTIONS export naming.
  return constName
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// ===================================================================
// 8. D5 consent is shown to R0 too, and D2/D3 sequencing is wired
// ===================================================================
{
  const d5 = Survey.findQuestionById("d5_consent");
  check("D5 consent is flagged showToR0", !!(d5 && d5.showToR0), "d5_consent.showToR0 must be true");

  const d3 = Survey.findQuestionById("d3");
  check(
    "D3 is gated on D2 being locked",
    !!(d3 && d3.showIf && Survey.collectFields(d3.showIf).includes("d2")),
    "d3.showIf must reference d2"
  );
}

// ===================================================================
// Report
// ===================================================================
console.log("Group 11 Survey — questions.js validation\n" + "=".repeat(42));

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) FAILED:\n`);
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
  console.log("\nBranch paths not printed — fix the failures above first.\n");
  process.exit(1);
}

const totalChecks = 8;
console.log(`\nAll ${totalChecks} checks passed.\n`);

// ===================================================================
// Deterministic branch paths
// ===================================================================
const BRANCH_LABELS = {
  R0: "Screened out",
  R1: "Current user",
  R2: "Lapsed",
  R3: "Aware",
  R4: "Unaware",
};

// Doc-numbering display code for a question id. A3 and C1.7 are each ONE
// numbered question in the source doc even though they're modelled as
// multiple fields here (A3 = two dropdowns on one screen; C1.7 = a
// yes/no plus two conditional follow-up dropdowns) — codeOf() always
// returns the doc's base code; the multi-field collapsing itself happens
// in buildDisplayEntries() below.
function codeOf(id) {
  const overrides = { d5_consent: "D5" };
  if (overrides[id]) return overrides[id];
  let m = id.match(/^([abcd])(\d)_(\d+)/);
  if (m) return `${m[1].toUpperCase()}${m[2]}.${m[3]}`;
  m = id.match(/^([abcd])(\d)/);
  if (m) return `${m[1].toUpperCase()}${m[2]}`;
  return id.toUpperCase();
}

// Compact "CODE=value" / "CODE≠value" condition text, collapsing an `in`
// clause down to its complement when it excludes exactly one option
// (e.g. B5 in [Yes, Used to stopped] -> "B5≠No"), matching how a human
// would actually describe the gate.
function compactLeaf(condition, negate) {
  const fieldCode = codeOf(condition.field);
  if ("equals" in condition) {
    return negate ? `${fieldCode}≠${condition.equals}` : `${fieldCode}=${condition.equals}`;
  }
  if ("in" in condition) {
    const question = Survey.findQuestionById(condition.field);
    const allValues = (question && question.options ? question.options : []).map((o) => o.value);
    const excluded = allValues.filter((v) => !condition.in.includes(v));
    if (excluded.length === 1) {
      return negate ? `${fieldCode}=${excluded[0]}` : `${fieldCode}≠${excluded[0]}`;
    }
    const list = condition.in.join("/");
    return negate ? `${fieldCode} not in [${list}]` : `${fieldCode} in [${list}]`;
  }
  if ("locked" in condition) {
    return negate ? `${fieldCode} not submitted` : `${fieldCode} submitted`;
  }
  return Survey.describeCondition(negate ? { not: condition } : condition);
}

function compactDescribe(condition) {
  if (condition.allOf) return condition.allOf.map(compactDescribe).join(" and ");
  if (condition.anyOf) return "(" + condition.anyOf.map(compactDescribe).join(" or ") + ")";
  if (condition.not) return compactLeaf(condition.not, true);
  return compactLeaf(condition, false);
}

// Collapse multi-field questions (A3, C1.7's follow-ups) down to the
// single doc-numbered code a respondent would recognise as "one question",
// then render each surviving entry as a plain code or a "[CODE if ...]"
// bracket.
function buildDisplayEntries(rawEntries) {
  const out = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const e = rawEntries[i];

    if (e.id === "a3_current" && rawEntries[i + 1] && rawEntries[i + 1].id === "a3_hometown") {
      out.push("A3");
      i += 1; // consume a3_hometown too
      continue;
    }

    if (e.id === "c1_7_product" || e.id === "c1_7_brand") {
      const already = out[out.length - 1];
      const tag = `[C1.7 follow-ups if ${compactDescribe({ field: "c1_7", equals: "Yes" })}]`;
      if (already !== tag) out.push(tag);
      continue;
    }

    if (e.status === "conditional") {
      out.push(`[${codeOf(e.id)} if ${compactDescribe(rawEntryCondition(e))}]`);
    } else {
      out.push(codeOf(e.id));
    }
  }
  return out;
}

// getPathForBranch() only gives us the rendered conditionText string, not
// the original condition object — refetch it from the question so
// compactDescribe can work off real structure, not re-parse prose.
function rawEntryCondition(entry) {
  const q = Survey.findQuestionById(entry.id);
  return q.showIf;
}

console.log("Deterministic branch paths\n" + "=".repeat(42) + "\n");

for (const branch of Survey.BRANCHES) {
  const entries = Survey.getPathForBranch(branch);
  const rendered = buildDisplayEntries(entries);
  console.log(`${branch} (${BRANCH_LABELS[branch]}): ${rendered.join(" → ")}`);
}
console.log("");

process.exit(0);
