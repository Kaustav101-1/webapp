/**
 * Group 11 — Minimalist Survey — Apps Script backend
 * ================================================
 * NOTE: This file is kept for record-keeping / redeploy reference. The
 * live Web App is already deployed (URL is the CONFIG constant at the
 * top of survey.js) — do not redeploy from this file without checking
 * with the group first, since it would mint a new URL.
 *
 * This is a reconstruction matching the original spec + the live
 * doGet health check response confirmed on 2026-08-03
 * ({"ok":true,"service":"group11-survey"}) — if it ever needs to be
 * pasted back into script.google.com to recreate the deployment, this
 * is the reference copy.
 *
 * COLUMN_ORDER below must be kept in sync BY HAND with questions.js's
 * `columnOrder` — Apps Script is a separate runtime, there is no shared
 * import between the two.
 */

var SHEET_ID = "1UPG_d485xiS1yhNV6Itet0ZpFXYmJ9UqPx03TbL3dTw";

var COLUMN_ORDER = [
  "respondent_name",
  "respondent_email",
  "response_id",
  "submitted_at_ist",
  "branch",
  "completed",
  "duration_seconds",
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
  "c2_1",
  "c2_1_other",
  "c2_2",
  "c2_2_other",
  "c2_3",
  "c2_4",
  "c2_5",
  "c3_1",
  "c3_2",
  "c3_3",
  "c4_1",
  "c4_2",
  "d1",
  "d2",
  "d3",
  "d4",
  "d5_consent",
  "intl_brand_user",
  "quick_commerce_buyer",
  "grooming_led",
  "shuffle_seed",
];

function doGet(e) {
  return jsonResponse_({ ok: true, service: "group11-survey" });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getSheet_();
    ensureHeader_(sheet);

    var row = COLUMN_ORDER.map(function (col) {
      var v = data[col];
      return v === undefined || v === null ? "" : v;
    });
    sheet.appendRow(row);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheets()[0];
  return sheet;
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMN_ORDER);
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
