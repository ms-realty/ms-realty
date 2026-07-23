import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertMobileElderlyQaReport,
  buildMobileElderlyQaReport,
} from "../lib/mobile-elderly-qa.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("mobile elderly QA report covers rendered public pages and language policy", () => {
  const report = buildMobileElderlyQaReport({ generatedAt: "2026-07-05T00:00:00Z" });
  assert.equal(assertMobileElderlyQaReport(report), true);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.checks.find((check) => check.id === "mobile_search_form").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "mobile_search_actions").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "mobile_search_empty_recovery").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "mobile_app_navigation").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "approved_buyer_guide_discovery").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "compact_mobile_footer").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "admin_mobile_editor_targets").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "narrow_mobile_search_action").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "mobile_safe_area_and_feedback").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "intent_specific_lead_forms").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "listing_detail_media_actions").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "approved_360_tour_accessibility").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "seller_valuation_broker_review").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "seller_property_intake").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "source_backed_search_filters").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "react_public_bodies").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "admin_and_market_languages").status, "pass");
});

test("generated mobile elderly QA report is valid when present", () => {
  const file = fromRoot("production", "data", "mobile-elderly-qa-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertMobileElderlyQaReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
