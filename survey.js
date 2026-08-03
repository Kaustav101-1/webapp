/**
 * Group 11 — Minimalist Survey — Engine
 * ================================================
 * STEP 2 SCOPE: routing/derivation engine only (pure logic, no DOM).
 * Rendering, navigation UI, and submission are added in later steps.
 *
 * Loaded two ways with zero build step:
 *   - Browser: <script src="questions.js"> then <script src="survey.js">,
 *     reads window.QUESTIONS, exposes window.Survey.
 *   - Node (scripts/validate-questions.js): require('./survey.js'), which
 *     requires ./questions.js itself.
 * Both paths run the exact same condition-evaluation code, so the
 * validator's printed branch paths can never drift from runtime behaviour.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./questions.js"));
  } else {
    root.Survey = factory(root.QUESTIONS);
  }
})(typeof window !== "undefined" ? window : globalThis, function (QUESTIONS) {
  "use strict";

  // -----------------------------------------------------------------
  // Live condition evaluation — used at runtime against real answers.
  // `get(field)` resolves a field name to its current in-memory value.
  // -----------------------------------------------------------------
  function evaluateCondition(condition, get) {
    if (condition.allOf) return condition.allOf.every((c) => evaluateCondition(c, get));
    if (condition.anyOf) return condition.anyOf.some((c) => evaluateCondition(c, get));
    if (condition.not) return !evaluateCondition(condition.not, get);

    // "locked" is a navigation-gate flag, not the field's actual answer
    // value (e.g. D2's text answer and "has D2 been submitted yet" are two
    // different things) — look it up under a separate bookkeeping key so
    // it never collides with the real answer.
    if ("locked" in condition) return get("__locked__" + condition.field) === condition.locked;

    const value = get(condition.field);
    if ("equals" in condition) return value === condition.equals;
    if ("in" in condition) return condition.in.includes(value);
    if ("notIn" in condition) return !condition.notIn.includes(value);
    if ("includes" in condition) return Array.isArray(value) && value.includes(condition.includes);
    if ("notIncludes" in condition) return !(Array.isArray(value) && value.includes(condition.notIncludes));
    if ("includesAnyOf" in condition)
      return Array.isArray(value) && condition.includesAnyOf.some((v) => value.includes(v));
    if ("exists" in condition) {
      const isEmpty = value === undefined || value === null || value === "";
      return condition.exists ? !isEmpty : isEmpty;
    }
    throw new Error("Unrecognized condition: " + JSON.stringify(condition));
  }

  // -----------------------------------------------------------------
  // Static 3-state resolver — used for structural analysis (branch-path
  // printing, validation) where only a *subset* of fields are known ahead
  // of time (facts fixed by having reached a given branch). Anything the
  // condition touches that ISN'T in `facts` is a genuinely free,
  // per-respondent answer, and resolves to 'unknown' rather than guessing.
  // -----------------------------------------------------------------
  function resolveStatic(condition, facts) {
    const has = (f) => Object.prototype.hasOwnProperty.call(facts, f);

    if (condition.allOf) {
      const results = condition.allOf.map((c) => resolveStatic(c, facts));
      if (results.some((r) => r === "unknown")) return "unknown";
      return results.every((r) => r === true);
    }
    if (condition.anyOf) {
      const results = condition.anyOf.map((c) => resolveStatic(c, facts));
      if (results.some((r) => r === true)) return true;
      if (results.some((r) => r === "unknown")) return "unknown";
      return false;
    }
    if (condition.not) {
      const r = resolveStatic(condition.not, facts);
      return r === "unknown" ? "unknown" : !r;
    }

    const field = condition.field;
    if ("locked" in condition) return "unknown"; // a nav gate, never branch-known
    if (!has(field)) return "unknown";
    const value = facts[field];
    if ("equals" in condition) return value === condition.equals;
    if ("in" in condition) return condition.in.includes(value);
    if ("notIn" in condition) return !condition.notIn.includes(value);
    if ("includes" in condition) return Array.isArray(value) && value.includes(condition.includes);
    if ("notIncludes" in condition) return !(Array.isArray(value) && value.includes(condition.notIncludes));
    if ("includesAnyOf" in condition)
      return Array.isArray(value) && condition.includesAnyOf.some((v) => value.includes(v));
    return "unknown";
  }

  // Human-readable rendering of a condition, for the bracketed annotations
  // in the printed branch paths and for validator error messages.
  function describeCondition(condition) {
    if (condition.allOf) return condition.allOf.map(describeCondition).join(" AND ");
    if (condition.anyOf) return "(" + condition.anyOf.map(describeCondition).join(" OR ") + ")";
    if (condition.not) return "NOT (" + describeCondition(condition.not) + ")";

    const f = condition.field.toUpperCase();
    if ("equals" in condition) return `${f} = "${condition.equals}"`;
    if ("in" in condition) return `${f} in [${condition.in.join(", ")}]`;
    if ("notIn" in condition) return `${f} not in [${condition.notIn.join(", ")}]`;
    if ("includes" in condition) return `${f} includes "${condition.includes}"`;
    if ("notIncludes" in condition) return `${f} does not include "${condition.notIncludes}"`;
    if ("includesAnyOf" in condition) return `${f} includes any of [${condition.includesAnyOf.join(", ")}]`;
    if ("locked" in condition) return `${f} has been submitted/locked`;
    return JSON.stringify(condition);
  }

  // Recursively collect every `field` name a condition references —
  // used by the validator to check conditions don't point at typos.
  function collectFields(condition, out) {
    out = out || [];
    if (condition.allOf) condition.allOf.forEach((c) => collectFields(c, out));
    else if (condition.anyOf) condition.anyOf.forEach((c) => collectFields(c, out));
    else if (condition.not) collectFields(condition.not, out);
    else if (condition.field) out.push(condition.field);
    return out;
  }

  // -----------------------------------------------------------------
  // Branch derivation (Design Logic section of the source doc)
  // -----------------------------------------------------------------
  const BRANCHES = ["R0", "R1", "R2", "R3", "R4"];

  function deriveBranch(answers) {
    if (answers.a1 === "Under 18") return "EXIT_UNDER18";
    if (answers.a4 === "No") return "R0";

    const minimalistStatus = answers.a6_statuses && answers.a6_statuses["Minimalist"];
    if (minimalistStatus === "Using now") return "R1";
    if (minimalistStatus === "Used before, stopped") return "R2";

    // Minimalist not selected in A6 — branch depends on A7.
    if (answers.a7 === "Yes, know it well" || answers.a7 === "Yes, heard the name") return "R3";
    if (answers.a7 === "No") return "R4";

    return null; // not yet determinable from answers so far
  }

  // The minimum set of field values that are fully fixed once a
  // respondent has reached a given branch. Used only for STATIC path
  // analysis (resolveStatic), never for live routing (deriveBranch is the
  // real routing logic — this table exists purely so the validator can
  // classify each conditional question as branch-fixed vs genuinely free).
  const BRANCH_FACTS = {
    R0: { a4: "No" },
    R1: { a4: "Yes, a regular routine", a6_brands: ["Minimalist"] },
    R2: { a4: "Yes, a regular routine", a6_brands: ["Minimalist"] },
    R3: { a4: "Yes, a regular routine", a6_brands: ["Dot & Key"], a7: "Yes, know it well" },
    R4: { a4: "Yes, a regular routine", a6_brands: ["Dot & Key"], a7: "No" },
  };

  // -----------------------------------------------------------------
  // Derived profile flags — cross-tab variables, never used for routing.
  // -----------------------------------------------------------------
  function computeDerivedFlags(answers) {
    const get = (field) => answers[field];
    const flags = {};
    QUESTIONS.derivedFlags.forEach((flag) => {
      flags[flag.id] = evaluateCondition(flag.rule, get);
    });
    return flags;
  }

  // -----------------------------------------------------------------
  // Question flow
  // -----------------------------------------------------------------

  // Full section order for branches R1–R4. R0 short-circuits to a
  // hand-picked subset (see getPathForBranch) — it's a structurally
  // different flow (skips B and C entirely), not a filtered version of
  // this one, so it isn't built by filtering this list.
  function flattenForBranch(branch) {
    const sectionC = QUESTIONS.branchToSectionC[branch] || [];
    return [...QUESTIONS.sections.A, ...QUESTIONS.sections.B, ...sectionC, ...QUESTIONS.sections.D];
  }

  // Live navigation: given a branch and the answers collected so far,
  // return the questions that are actually visible, in order.
  function getVisibleQuestions(branch, answers) {
    if (branch === "R0") {
      return ["a1", "a2", "a3_current", "a3_hometown", "a4", "d5_consent"].map((id) => findQuestionById(id));
    }
    const get = (field) => answers[field];
    return flattenForBranch(branch).filter((q) => !q.showIf || evaluateCondition(q.showIf, get));
  }

  function findQuestionById(id) {
    const all = [
      ...QUESTIONS.sections.A,
      ...QUESTIONS.sections.B,
      ...QUESTIONS.sections.C1,
      ...QUESTIONS.sections.C2,
      ...QUESTIONS.sections.C3,
      ...QUESTIONS.sections.C4,
      ...QUESTIONS.sections.D,
    ];
    return all.find((q) => q.id === id);
  }

  // Structural path for a branch, independent of any real respondent's
  // answers — every question is classified as:
  //   'shown'       — always visible on this branch (no condition, or a
  //                    condition fully resolved true by BRANCH_FACTS)
  //   'conditional' — condition depends on a free (non-branch-fixed)
  //                    answer; visibility genuinely varies per respondent
  //   (omitted)     — condition fully resolved false by BRANCH_FACTS;
  //                    structurally impossible to see on this branch
  function getPathForBranch(branch) {
    if (branch === "R0") {
      return ["a1", "a2", "a3_current", "a3_hometown", "a4", "d5_consent"].map((id) => ({
        id,
        status: "shown",
      }));
    }
    const facts = BRANCH_FACTS[branch];
    const path = [];
    for (const q of flattenForBranch(branch)) {
      if (!q.showIf) {
        path.push({ id: q.id, status: "shown" });
        continue;
      }
      const resolved = resolveStatic(q.showIf, facts);
      if (resolved === true) path.push({ id: q.id, status: "shown" });
      else if (resolved === "unknown")
        path.push({ id: q.id, status: "conditional", conditionText: describeCondition(q.showIf) });
      // resolved === false: structurally excluded from this branch, omit
    }
    return path;
  }

  // -----------------------------------------------------------------
  // Column production — which sheet column(s) a given question populates.
  // Single source of truth for the schema<->question bidirectional
  // reachability check in the validator.
  // -----------------------------------------------------------------
  function getProducedColumns(question) {
    const cols = [];
    switch (question.type) {
      case "single-select":
      case "single-dropdown":
      case "scale-0-10":
      case "text-short":
      case "text-locked":
      case "consent":
      case "multiselect":
      case "multiselect-exact":
        cols.push(question.id);
        break;
      case "multiselect-then-rank":
      case "rank":
        cols.push(question.columns.rank1, question.columns.rank2);
        if (question.columns.rank3) cols.push(question.columns.rank3);
        break;
      case "matrix-dropdown":
        question.rows.forEach((row) => {
          cols.push(row.column);
          if (row.otherColumn) cols.push(row.otherColumn);
        });
        break;
      case "multiselect-with-status-followup":
        cols.push(question.columns.selections);
        if (question.columns.statuses) cols.push(question.columns.statuses);
        if (question.columns.minimalistStatusDerived) cols.push(question.columns.minimalistStatusDerived);
        break;
      default:
        throw new Error(`Unknown question type "${question.type}" on question "${question.id}"`);
    }
    if (question.otherColumn) cols.push(question.otherColumn);
    return cols;
  }

  // -----------------------------------------------------------------
  // Runtime app — browser only. Everything below manipulates the DOM and
  // never runs under Node (guarded), so the validator above stays pure.
  // -----------------------------------------------------------------
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    // ==== CONFIG — the only line to change if the Apps Script is redeployed ====
    var APPS_SCRIPT_URL =
      "https://script.google.com/macros/s/AKfycbx5ogxawkUnuXJTMF8RTNXEteJGgG9IjEEnkD_0ZIyckg1humKKqB0o89gY3A88O8bVXQ/exec";
    // ============================================================================

    var STORAGE_KEY = "g11_survey_progress_v1";
    var COMPLETED_KEY = "g11_survey_completed_v1";

    var SECTION_LABELS = {
      A: "About you",
      B: "Your skincare",
      C1: "About Minimalist",
      C2: "About Minimalist",
      C3: "About Minimalist",
      C4: "About Minimalist",
      D: "One last thing",
    };

    // Back is disallowed crossing the D2/D3 boundary (D2's own flag) and
    // when re-entering a just-determined branch (first question of C).
    var NO_BACK_IDS = new Set(["d3", "c1_1", "c2_1", "c3_1", "c4_1"]);

    var state = null;
    var brandOrderCache = null;

    // ---- tiny DOM builder ----
    function el(tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          if (k === "class") node.className = attrs[k];
          else if (k === "text") node.textContent = attrs[k];
          else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
          else node.setAttribute(k, attrs[k]);
        });
      }
      (children || []).forEach(function (c) {
        if (c) node.appendChild(c);
      });
      return node;
    }

    // ---- ids / seeded shuffle ----
    function uuidv4() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    function mulberry32(seed) {
      var a = seed;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function seededShuffle(array, seed) {
      var rng = mulberry32(seed);
      var arr = array.slice();
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    // ---- option list helpers (mirrors the validator's naming convention) ----
    function toCamelListName(constName) {
      return constName.toLowerCase().replace(/_([a-z0-9])/g, function (_, c) {
        return c.toUpperCase();
      });
    }
    function normalizeOption(o) {
      if (typeof o === "string") return { value: o, label: o };
      return Object.assign({}, o, { label: o.label || o.value });
    }
    function getBaseOptionList(question) {
      var raw = question.optionsRef ? QUESTIONS[toCamelListName(question.optionsRef)] : question.options;
      return raw.map(normalizeOption);
    }
    function getBrandOrder() {
      if (brandOrderCache) return brandOrderCache;
      var nonPinnedValues = QUESTIONS.brandList.filter(function (o) {
        return !o.pin;
      }).map(function (o) {
        return o.value;
      });
      brandOrderCache = seededShuffle(nonPinnedValues, state.seed);
      return brandOrderCache;
    }
    function getOptionList(question) {
      var base = getBaseOptionList(question);
      if (question.shuffleGroup !== "brandList") return base;
      var order = getBrandOrder();
      var pinned = base.filter(function (o) {
        return o.pin === "bottom";
      });
      var nonPinned = order
        .map(function (v) {
          return base.filter(function (o) {
            return o.value === v;
          })[0];
        })
        .filter(Boolean);
      return nonPinned.concat(pinned);
    }

    // ---- persistence ----
    function freshState() {
      return {
        screen: "landing",
        responseId: uuidv4(),
        seed: Math.floor(Math.random() * Math.pow(2, 31)),
        startedAt: Date.now(),
        branch: null,
        currentId: null,
        answers: {},
      };
    }
    function saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        /* storage unavailable — resume just won't work, non-fatal */
      }
    }
    function loadState() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    function clearState() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
    }

    // ---- flow ----
    function getCurrentList() {
      if (state.branch) return getVisibleQuestions(state.branch, state.answers);
      var get = function (field) {
        return state.answers[field];
      };
      return QUESTIONS.sections.A.filter(function (q) {
        return !q.showIf || evaluateCondition(q.showIf, get);
      });
    }

    function updateBranchAfterAnswer() {
      var derived = deriveBranch(state.answers);
      if (derived === "EXIT_UNDER18") {
        clearState();
        state.screen = "under18";
        render();
        return true;
      }
      if (derived) state.branch = derived;
      return false;
    }

    function validateCurrentQuestion(question) {
      var a = state.answers;
      switch (question.type) {
        case "single-select":
        case "single-dropdown":
          if (question.required && !a[question.id]) return "Please select an option.";
          break;
        case "multiselect": {
          var arr = a[question.id] || [];
          if (question.required && arr.length === 0) return "Please select at least one option.";
          if (question.otherColumn && arr.indexOf(question.otherTrigger) !== -1 && !(a[question.otherColumn] || "").trim()) {
            return "Please specify.";
          }
          break;
        }
        case "multiselect-with-status-followup": {
          var brands = a.a6_brands || [];
          if (question.required && brands.length === 0) return "Please select at least one option.";
          var statuses = a.a6_statuses || {};
          for (var bi = 0; bi < brands.length; bi++) {
            var brand = brands[bi];
            if (brand === question.exclusiveValue) continue;
            if (brand === question.otherTrigger) {
              if (!(a[question.otherColumn] || "").trim()) return "Please specify the brand.";
            }
            var key = brand === question.otherTrigger ? a[question.otherColumn] : brand;
            if (!statuses[key]) return 'Please choose "Using now" or "Used before, stopped" for each selected brand.';
          }
          break;
        }
        case "matrix-dropdown": {
          for (var ri = 0; ri < question.rows.length; ri++) {
            var row = question.rows[ri];
            if (question.required && !a[row.column]) return 'Please choose a brand for "' + row.label + '".';
            if (row.otherColumn && a[row.column] === question.otherTrigger && !(a[row.otherColumn] || "").trim()) {
              return 'Please specify the brand for "' + row.label + '".';
            }
          }
          break;
        }
        case "multiselect-then-rank": {
          var temp = a["__temp__" + question.id] || [];
          if (question.required && temp.length < question.rankCount) {
            return "Please select at least " + question.rankCount + " options, then rank them.";
          }
          if (!a[question.columns.rank1] || !a[question.columns.rank2]) return "Please complete your ranking.";
          break;
        }
        case "rank": {
          var cols = [question.columns.rank1, question.columns.rank2, question.columns.rank3].filter(Boolean);
          for (var ci = 0; ci < cols.length; ci++) {
            if (!a[cols[ci]]) return "Please complete your ranking.";
          }
          break;
        }
        case "multiselect-exact": {
          var exactArr = a[question.id] || [];
          if (exactArr.length !== question.exactCount) return "Please select exactly " + question.exactCount + ".";
          break;
        }
        case "scale-0-10":
          if (question.required && (a[question.id] === undefined || a[question.id] === null)) return "Please choose a value.";
          break;
        case "text-short":
        case "text-locked":
          if (question.required && !(a[question.id] || "").trim()) return "Please enter a response.";
          break;
        case "consent":
          if (!a.d5_consent) return "Please confirm to continue.";
          break;
      }
      return null;
    }

    function showError(msg) {
      var slot = document.getElementById("field-error-slot");
      if (!slot) return;
      slot.innerHTML = "";
      slot.appendChild(el("div", { class: "field-error", text: msg }));
    }

    function goNext() {
      var list = getCurrentList();
      var idx = list.findIndex(function (q) {
        return q.id === state.currentId;
      });
      var question = list[idx];
      var error = validateCurrentQuestion(question);
      if (error) {
        showError(error);
        return;
      }
      if (question.id === "d2") state.answers.__locked__d2 = true;
      if (updateBranchAfterAnswer()) return;
      saveState();
      var newList = getCurrentList();
      var newIdx = newList.findIndex(function (q) {
        return q.id === state.currentId;
      });
      var next = newList[newIdx + 1];
      if (!next) {
        completeSurvey();
        return;
      }
      state.currentId = next.id;
      saveState();
      render();
    }

    function goBack() {
      var list = getCurrentList();
      var idx = list.findIndex(function (q) {
        return q.id === state.currentId;
      });
      if (idx <= 0) return;
      var question = list[idx];
      if (NO_BACK_IDS.has(question.id)) return;
      state.currentId = list[idx - 1].id;
      saveState();
      render();
    }

    // IST has no DST, so this is always UTC+5:30 — no timezone library needed.
    function formatIST(date) {
      var ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
      var pad = function (n) {
        return String(n).padStart(2, "0");
      };
      return (
        ist.getUTCFullYear() +
        "-" +
        pad(ist.getUTCMonth() + 1) +
        "-" +
        pad(ist.getUTCDate()) +
        " " +
        pad(ist.getUTCHours()) +
        ":" +
        pad(ist.getUTCMinutes()) +
        ":" +
        pad(ist.getUTCSeconds())
      );
    }

    // Flattens the in-memory answer shapes (arrays, the a6 status map) into
    // the exact flat 74-column row questions.js's columnOrder expects —
    // the single source of truth for what gets written to the sheet.
    function buildSheetRow() {
      var a = state.answers;
      var flags = computeDerivedFlags(a);
      var statuses = a.a6_statuses || {};
      var row = {};

      QUESTIONS.columnOrder.forEach(function (col) {
        var value;
        if (col === "respondent_name") value = a.respondent_name || "";
        else if (col === "respondent_email") value = a.respondent_email || "";
        else if (col === "response_id") value = state.responseId;
        else if (col === "submitted_at_ist") value = formatIST(new Date());
        else if (col === "branch") value = state.branch;
        else if (col === "completed") value = true;
        else if (col === "duration_seconds") value = Math.round((Date.now() - state.startedAt) / 1000);
        else if (col === "shuffle_seed") value = state.seed;
        else if (col === "a6_brand_statuses") {
          value = Object.keys(statuses)
            .map(function (brand) {
              return brand + ":" + statuses[brand];
            })
            .join("; ");
        } else if (col === "a6_minimalist_status") value = statuses["Minimalist"] || "";
        else if (Object.prototype.hasOwnProperty.call(flags, col)) value = flags[col];
        else {
          var raw = a[col];
          if (Array.isArray(raw)) value = raw.join("; ");
          else if (raw === undefined || raw === null) value = "";
          else value = raw;
        }
        row[col] = value;
      });
      return row;
    }

    // POSTs as text/plain with a JSON string body — a "simple request" that
    // skips CORS preflight entirely (Apps Script Web Apps can't handle
    // preflight). Retries twice with backoff (3 attempts total) before
    // giving up.
    function submitRow(row, attempt) {
      attempt = attempt || 1;
      console.log("[survey] POST attempt " + attempt + " ->", APPS_SCRIPT_URL);
      console.log("[survey] request body:", JSON.stringify(row));
      return fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(row),
      })
        .then(function (res) {
          return res.text().then(function (text) {
            console.log("[survey] response status:", res.status, "body:", text);
            if (!res.ok) throw new Error("HTTP " + res.status + ": " + text);
            var json;
            try {
              json = JSON.parse(text);
            } catch (e) {
              throw new Error("Non-JSON response: " + text);
            }
            if (!json || json.ok !== true) throw new Error("Server reported failure: " + text);
            return json;
          });
        })
        .catch(function (err) {
          console.warn("[survey] attempt " + attempt + " failed:", err.message);
          if (attempt < 3) {
            var delayMs = attempt * 1000; // 1s, then 2s
            return new Promise(function (resolve) {
              setTimeout(resolve, delayMs);
            }).then(function () {
              return submitRow(row, attempt + 1);
            });
          }
          throw err;
        });
    }

    function completeSurvey() {
      state.screen = "submitting";
      render();

      var row = buildSheetRow();
      submitRow(row)
        .then(function () {
          try {
            localStorage.setItem(COMPLETED_KEY, "true");
          } catch (e) {
            /* ignore */
          }
          clearState(); // only clear once the write is confirmed
          state.screen = "thankyou";
          render();
        })
        .catch(function (err) {
          console.error("[survey] submission failed after retries:", err);
          // Deliberately do NOT clear localStorage or mark completed — the
          // answers stay saved so Retry (or a reload) can try again.
          state.screen = "submit-error";
          render();
        });
    }

    // ---- question-type renderers ----
    function renderOtherTextInline(columnKey, maxLength) {
      var wrap = el("div", { class: "option-followup" });
      var input = el("input", { type: "text", class: "text-input", maxlength: String(maxLength || 200), placeholder: "Please specify" });
      input.value = state.answers[columnKey] || "";
      input.addEventListener("input", function () {
        state.answers[columnKey] = input.value;
        saveState();
      });
      wrap.appendChild(input);
      return wrap;
    }

    function renderSingleSelect(question, container, rerender) {
      getOptionList(question).forEach(function (opt) {
        var checked = state.answers[question.id] === opt.value;
        var input = el("input", { type: "radio", name: question.id, value: opt.value });
        input.checked = checked;
        input.addEventListener("change", function () {
          state.answers[question.id] = opt.value;
          saveState();
          rerender();
        });
        container.appendChild(
          el("label", { class: "option-row" + (checked ? " checked" : "") }, [input, el("span", { class: "option-label", text: opt.label })])
        );
      });
    }

    function renderSingleDropdown(question, container) {
      var select = el("select", { class: "native-select" });
      select.appendChild(el("option", { value: "", text: "Select…" }));
      getOptionList(question).forEach(function (opt) {
        var o = el("option", { value: opt.value, text: opt.label });
        if (state.answers[question.id] === opt.value) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener("change", function () {
        state.answers[question.id] = select.value;
        saveState();
      });
      container.appendChild(select);
    }

    function renderMultiselect(question, container, rerender) {
      var selected = state.answers[question.id] || [];
      getOptionList(question).forEach(function (opt) {
        var checked = selected.indexOf(opt.value) !== -1;
        var input = el("input", { type: "checkbox", value: opt.value });
        input.checked = checked;
        input.addEventListener("change", function () {
          var arr = state.answers[question.id] || [];
          if (input.checked) arr = arr.concat([opt.value]);
          else arr = arr.filter(function (v) {
            return v !== opt.value;
          });
          state.answers[question.id] = arr;
          saveState();
          rerender();
        });
        container.appendChild(
          el("label", { class: "option-row" + (checked ? " checked" : "") }, [input, el("span", { class: "option-label", text: opt.label })])
        );
        if (question.otherTrigger === opt.value && checked) {
          container.appendChild(renderOtherTextInline(question.otherColumn, question.otherMaxLength));
        }
      });
    }

    function renderA6(question, container, rerender) {
      var selected = state.answers.a6_brands || [];
      var statuses = state.answers.a6_statuses || {};

      getOptionList(question).forEach(function (opt) {
        var checked = selected.indexOf(opt.value) !== -1;
        var isExclusive = opt.value === question.exclusiveValue;
        var input = el("input", { type: "checkbox", value: opt.value });
        input.checked = checked;
        input.addEventListener("change", function () {
          var arr = state.answers.a6_brands || [];
          if (input.checked) {
            if (isExclusive) {
              arr = [opt.value];
              state.answers.a6_statuses = {};
            } else {
              arr = arr.filter(function (v) {
                return v !== question.exclusiveValue;
              });
              arr = arr.concat([opt.value]);
            }
          } else {
            var key = opt.value === question.otherTrigger ? state.answers[question.otherColumn] || "Other" : opt.value;
            arr = arr.filter(function (v) {
              return v !== opt.value;
            });
            if (state.answers.a6_statuses) delete state.answers.a6_statuses[key];
          }
          state.answers.a6_brands = arr;
          saveState();
          rerender();
        });
        container.appendChild(
          el("label", { class: "option-row" + (checked ? " checked" : "") }, [input, el("span", { class: "option-label", text: opt.label })])
        );

        if (checked && !isExclusive) {
          var followup = el("div", { class: "option-followup" });
          if (opt.value === question.otherTrigger) {
            var textInput = el("input", {
              type: "text",
              class: "text-input",
              maxlength: String(question.otherMaxLength || 200),
              placeholder: "Please specify the brand",
            });
            textInput.value = state.answers[question.otherColumn] || "";
            textInput.addEventListener("input", function () {
              var oldKey = state.answers[question.otherColumn] || "Other";
              state.answers[question.otherColumn] = textInput.value;
              var newKey = textInput.value || "Other";
              if (state.answers.a6_statuses && oldKey !== newKey && state.answers.a6_statuses[oldKey] !== undefined) {
                state.answers.a6_statuses[newKey] = state.answers.a6_statuses[oldKey];
                delete state.answers.a6_statuses[oldKey];
              }
              saveState();
            });
            followup.appendChild(textInput);
          }
          var statusKey = opt.value === question.otherTrigger ? state.answers[question.otherColumn] || "Other" : opt.value;
          var pillsWrap = el("div", { class: "followup-pills" });
          question.statusFollowupOptions.forEach(function (statusVal) {
            var isSel = statuses[statusKey] === statusVal;
            var btn = el("button", { type: "button", class: "pill-btn" + (isSel ? " selected" : ""), text: statusVal });
            btn.addEventListener("click", function () {
              if (!state.answers.a6_statuses) state.answers.a6_statuses = {};
              state.answers.a6_statuses[statusKey] = statusVal;
              saveState();
              rerender();
            });
            pillsWrap.appendChild(btn);
          });
          followup.appendChild(pillsWrap);
          container.appendChild(followup);
        }
      });
    }

    function renderMatrixB1(question, container, rerender) {
      var options = getOptionList(question);
      question.rows.forEach(function (row) {
        var rowWrap = el("div", { class: "matrix-row" });
        rowWrap.appendChild(el("div", { class: "matrix-row-label", text: row.label }));
        var select = el("select", { class: "native-select" });
        select.appendChild(el("option", { value: "", text: "Select…" }));
        options.forEach(function (opt) {
          var o = el("option", { value: opt.value, text: opt.label });
          if (state.answers[row.column] === opt.value) o.selected = true;
          select.appendChild(o);
        });
        select.addEventListener("change", function () {
          state.answers[row.column] = select.value;
          saveState();
          rerender();
        });
        rowWrap.appendChild(select);

        if (row.otherColumn && state.answers[row.column] === question.otherTrigger) {
          var otherInput = el("input", {
            type: "text",
            class: "text-input other-input",
            maxlength: String(question.otherMaxLength || 200),
            placeholder: "Please specify",
          });
          otherInput.value = state.answers[row.otherColumn] || "";
          otherInput.addEventListener("input", function () {
            state.answers[row.otherColumn] = otherInput.value;
            saveState();
          });
          rowWrap.appendChild(otherInput);
        }
        container.appendChild(rowWrap);
      });
    }

    function buildRankSelect(labelText, columnKey, sourceValues, excludeValues, rerender) {
      var wrap = el("div", {});
      wrap.appendChild(el("div", { class: "rank-picker-label", text: labelText }));
      var select = el("select", { class: "native-select" });
      select.appendChild(el("option", { value: "", text: "Select…" }));
      sourceValues
        .filter(function (v) {
          return excludeValues.indexOf(v) === -1;
        })
        .forEach(function (v) {
          var o = el("option", { value: v, text: v });
          if (state.answers[columnKey] === v) o.selected = true;
          select.appendChild(o);
        });
      select.addEventListener("change", function () {
        state.answers[columnKey] = select.value;
        saveState();
        rerender();
      });
      wrap.appendChild(select);
      return wrap;
    }

    function renderMultiselectThenRank(question, container, rerender) {
      var tempKey = "__temp__" + question.id;
      var selected = state.answers[tempKey] || [];

      container.appendChild(el("div", { class: "helper-text", text: "Select all that apply." }));

      getOptionList(question).forEach(function (opt) {
        var checked = selected.indexOf(opt.value) !== -1;
        var input = el("input", { type: "checkbox", value: opt.value });
        input.checked = checked;
        input.addEventListener("change", function () {
          var arr = state.answers[tempKey] || [];
          if (input.checked) {
            arr = arr.concat([opt.value]);
          } else {
            arr = arr.filter(function (v) {
              return v !== opt.value;
            });
            if (state.answers[question.columns.rank1] === opt.value) delete state.answers[question.columns.rank1];
            if (state.answers[question.columns.rank2] === opt.value) delete state.answers[question.columns.rank2];
          }
          state.answers[tempKey] = arr;
          saveState();
          rerender();
        });
        container.appendChild(
          el("label", { class: "option-row" + (checked ? " checked" : "") }, [input, el("span", { class: "option-label", text: opt.label })])
        );
      });

      if (selected.length >= 2) {
        var rankWrap = el("div", { class: "rank-picker" });
        rankWrap.appendChild(el("div", { class: "rank-picker-label", text: "Rank your top 2 (most important first):" }));
        rankWrap.appendChild(buildRankSelect("Your #1", question.columns.rank1, selected, [], rerender));
        var rank1Val = state.answers[question.columns.rank1];
        rankWrap.appendChild(buildRankSelect("Your #2", question.columns.rank2, selected, rank1Val ? [rank1Val] : [], rerender));
        container.appendChild(rankWrap);
      } else if (selected.length > 0) {
        container.appendChild(el("div", { class: "helper-text", text: "Select at least 2 to rank your top 2." }));
      }
    }

    function renderRankPicker(question, container, rerender) {
      var options = getOptionList(question).map(function (o) {
        return o.value;
      });
      var cols = [question.columns.rank1, question.columns.rank2, question.columns.rank3].filter(Boolean);
      var excluded = [];
      cols.forEach(function (col, i) {
        container.appendChild(buildRankSelect("Your #" + (i + 1) + " frustration", col, options, excluded, rerender));
        if (state.answers[col]) excluded = excluded.concat([state.answers[col]]);
      });
    }

    function renderMultiselectExact(question, container, rerender) {
      var selected = state.answers[question.id] || [];
      var grid = el("div", { class: "word-grid" });
      getOptionList(question).forEach(function (opt) {
        var isSel = selected.indexOf(opt.value) !== -1;
        var atLimit = selected.length >= question.exactCount && !isSel;
        var chip = el("button", {
          type: "button",
          class: "word-chip" + (isSel ? " selected" : "") + (atLimit ? " disabled" : ""),
          text: opt.label,
        });
        chip.disabled = atLimit;
        chip.addEventListener("click", function () {
          var arr = state.answers[question.id] || [];
          if (isSel) {
            arr = arr.filter(function (v) {
              return v !== opt.value;
            });
          } else if (arr.length < question.exactCount) {
            arr = arr.concat([opt.value]);
          }
          state.answers[question.id] = arr;
          saveState();
          rerender();
        });
        grid.appendChild(chip);
      });
      container.appendChild(grid);
      container.appendChild(el("div", { class: "selection-counter", text: selected.length + " of " + question.exactCount + " selected" }));
    }

    function renderScale(question, container, rerender) {
      var grid = el("div", { class: "scale-grid" });
      for (var i = 0; i <= 10; i++) {
        (function (val) {
          var isSel = state.answers[question.id] === val;
          var btn = el("button", { type: "button", class: "scale-btn" + (isSel ? " selected" : ""), text: String(val) });
          btn.addEventListener("click", function () {
            state.answers[question.id] = val;
            saveState();
            rerender();
          });
          grid.appendChild(btn);
        })(i);
      }
      container.appendChild(grid);
      container.appendChild(
        el("div", { class: "scale-endlabels" }, [el("span", { text: "0 = Not at all likely" }), el("span", { text: "10 = Extremely likely" })])
      );
    }

    function renderTextField(question, container) {
      var maxLength = question.maxLength || 200;
      var textarea = el("textarea", { class: "text-area", maxlength: String(maxLength), placeholder: "Optional" });
      textarea.value = state.answers[question.id] || "";
      var counter = el("div", { class: "char-counter", text: textarea.value.length + "/" + maxLength });
      textarea.addEventListener("input", function () {
        state.answers[question.id] = textarea.value;
        counter.textContent = textarea.value.length + "/" + maxLength;
        saveState();
      });
      container.appendChild(textarea);
      container.appendChild(counter);
    }

    function renderConsent(question, container, rerender) {
      container.appendChild(el("div", { class: "consent-box", text: question.prompt }));
      var checked = !!state.answers.d5_consent;
      var input = el("input", { type: "checkbox" });
      input.checked = checked;
      input.addEventListener("change", function () {
        state.answers.d5_consent = input.checked;
        saveState();
        els.btnNext.disabled = !input.checked; // gate Submit — not just an error-on-click
        rerender();
      });
      container.appendChild(el("label", { class: "consent-checkbox-row" }, [input, el("span", { text: question.checkboxLabel })]));
    }

    function renderQuestionInput(question, container) {
      container.innerHTML = "";
      var rerender = function () {
        renderQuestionInput(question, container);
      };
      switch (question.type) {
        case "single-select":
          renderSingleSelect(question, container, rerender);
          break;
        case "single-dropdown":
          renderSingleDropdown(question, container);
          break;
        case "multiselect":
          renderMultiselect(question, container, rerender);
          break;
        case "multiselect-with-status-followup":
          renderA6(question, container, rerender);
          break;
        case "matrix-dropdown":
          renderMatrixB1(question, container, rerender);
          break;
        case "multiselect-then-rank":
          renderMultiselectThenRank(question, container, rerender);
          break;
        case "rank":
          renderRankPicker(question, container, rerender);
          break;
        case "multiselect-exact":
          renderMultiselectExact(question, container, rerender);
          break;
        case "scale-0-10":
          renderScale(question, container, rerender);
          break;
        case "text-short":
        case "text-locked":
          renderTextField(question, container);
          break;
        case "consent":
          renderConsent(question, container, rerender);
          break;
        default:
          container.appendChild(el("div", { text: "Unsupported question type: " + question.type }));
      }
    }

    // ---- screens ----
    var els = {};

    function isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function renderLanding() {
      els.card.innerHTML = "";
      var idFields = QUESTIONS.landing.identityFields;

      var nameInput = el("input", {
        type: "text",
        class: "text-input",
        maxlength: String(idFields.name.maxLength),
        placeholder: idFields.name.placeholder,
      });
      nameInput.value = state.answers.respondent_name || "";
      nameInput.addEventListener("input", function () {
        state.answers.respondent_name = nameInput.value;
        saveState();
      });

      var emailInput = el("input", {
        type: "email",
        class: "text-input",
        maxlength: String(idFields.email.maxLength),
        placeholder: idFields.email.placeholder,
      });
      emailInput.value = state.answers.respondent_email || "";
      emailInput.addEventListener("input", function () {
        state.answers.respondent_email = emailInput.value;
        saveState();
      });

      var errorSlot = el("div", { id: "landing-error-slot" });

      els.card.appendChild(
        el("div", { class: "landing" }, [
          el("h1", { text: QUESTIONS.landing.title }),
          el("p", { text: QUESTIONS.landing.body }),
          el("div", { class: "field-group" }, [nameInput, emailInput]),
          el("div", { class: "helper-text", text: idFields.helperText }),
          errorSlot,
          el("button", {
            class: "btn btn-primary btn-full",
            type: "button",
            text: QUESTIONS.landing.buttonLabel,
            onclick: function () {
              var email = (state.answers.respondent_email || "").trim();
              if (email && !isValidEmail(email)) {
                errorSlot.innerHTML = "";
                errorSlot.appendChild(
                  el("div", { class: "field-error", text: "Please enter a valid email address, or leave it blank." })
                );
                return;
              }
              state.currentId = "a1";
              state.screen = "question";
              saveState();
              render();
            },
          }),
        ])
      );
    }

    function renderUnder18() {
      els.card.innerHTML = "";
      els.card.appendChild(
        el("div", { class: "end-screen" }, [el("h1", { text: "Thanks for your interest" }), el("p", { text: QUESTIONS.under18Exit.message })])
      );
    }

    function renderAlreadyResponded() {
      els.card.innerHTML = "";
      els.card.appendChild(
        el("div", { class: "end-screen" }, [
          el("h1", { text: "You've already responded" }),
          el("p", { text: "Thanks again for taking part — only one response is needed per person." }),
        ])
      );
    }

    function renderThankYou() {
      els.card.innerHTML = "";
      var msg =
        state.branch === "R0"
          ? "Thanks for letting us know — that's all we need from you."
          : "Thank you for completing the survey. Your responses have been recorded.";
      els.card.appendChild(el("div", { class: "end-screen" }, [el("h1", { text: "All done" }), el("p", { text: msg })]));
    }

    function renderSubmitting() {
      els.card.innerHTML = "";
      els.card.appendChild(
        el("div", { class: "end-screen" }, [el("h1", { text: "Submitting…" }), el("p", { text: "Please don't close this tab." })])
      );
    }

    function renderSubmitError() {
      els.card.innerHTML = "";
      els.card.appendChild(
        el("div", { class: "end-screen" }, [
          el("h1", { text: "Couldn't save your responses" }),
          el("p", { text: "Nothing was lost — your answers are still on this device. Please check your connection and try again." }),
          el("button", {
            class: "btn btn-primary",
            type: "button",
            text: "Retry",
            style: "margin-top: 20px;",
            onclick: function () {
              completeSurvey();
            },
          }),
        ])
      );
    }

    function updateProgress(list, idx) {
      var percent;
      if (!state.branch) {
        percent = Math.min(90, Math.round(((idx + 1) / 20) * 100));
      } else {
        percent = Math.min(99, Math.round(((idx + 1) / list.length) * 100));
      }
      els.progressFill.style.width = percent + "%";
    }

    function updateNavButtons(list, idx, question) {
      els.btnBack.disabled = idx === 0 || NO_BACK_IDS.has(question.id);
      els.btnNext.textContent = question.id === "d5_consent" ? "Submit" : "Next";
      els.btnNext.disabled = question.id === "d5_consent" && !state.answers.d5_consent;
      els.btnBack.onclick = goBack;
      els.btnNext.onclick = goNext;
    }

    function renderQuestionScreen() {
      var list = getCurrentList();
      var idx = list.findIndex(function (q) {
        return q.id === state.currentId;
      });
      if (idx === -1) {
        state.currentId = list[0].id;
        idx = 0;
      }
      var question = list[idx];

      var sectionLabel = SECTION_LABELS[question.section];
      els.eyebrow.textContent = sectionLabel ? "IIM Bangalore · " + sectionLabel : "IIM Bangalore";
      updateProgress(list, idx);

      els.card.innerHTML = "";
      var wrap = el("div", {});
      if (question.type !== "consent") wrap.appendChild(el("div", { class: "prompt", text: question.prompt }));
      if (question.helperText) wrap.appendChild(el("div", { class: "helper-text", text: question.helperText }));
      var fieldContainer = el("div", { class: "field-group" });
      wrap.appendChild(fieldContainer);
      wrap.appendChild(el("div", { id: "field-error-slot" }));
      els.card.appendChild(wrap);

      renderQuestionInput(question, fieldContainer);
      updateNavButtons(list, idx, question);
    }

    function render() {
      var isQuestion = state.screen === "question";
      els.progressTrack.hidden = !isQuestion;
      els.header.hidden = false; // "IIM Bangalore" label stays visible on every screen
      els.footer.hidden = !isQuestion;
      if (!isQuestion) els.eyebrow.textContent = "IIM Bangalore";

      if (state.screen === "landing") return renderLanding();
      if (state.screen === "under18") return renderUnder18();
      if (state.screen === "already-responded") return renderAlreadyResponded();
      if (state.screen === "thankyou") return renderThankYou();
      if (state.screen === "submitting") return renderSubmitting();
      if (state.screen === "submit-error") return renderSubmitError();
      return renderQuestionScreen();
    }

    function init() {
      els.progressTrack = document.getElementById("progress-track");
      els.progressFill = document.getElementById("progress-fill");
      els.header = document.getElementById("app-header");
      els.eyebrow = document.getElementById("section-eyebrow");
      els.card = document.getElementById("app-card");
      els.footer = document.getElementById("app-footer");
      els.btnBack = document.getElementById("btn-back");
      els.btnNext = document.getElementById("btn-next");

      var alreadyCompleted = false;
      try {
        alreadyCompleted = localStorage.getItem(COMPLETED_KEY) === "true";
      } catch (e) {
        /* ignore */
      }

      if (alreadyCompleted) {
        state = freshState();
        state.screen = "already-responded";
        render();
        return;
      }

      var saved = loadState();
      state = saved && saved.screen && saved.screen !== "landing" ? saved : freshState();
      render();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    evaluateCondition,
    resolveStatic,
    describeCondition,
    collectFields,
    deriveBranch,
    BRANCH_FACTS,
    BRANCHES,
    computeDerivedFlags,
    flattenForBranch,
    getVisibleQuestions,
    getPathForBranch,
    findQuestionById,
    getProducedColumns,
  };
});
