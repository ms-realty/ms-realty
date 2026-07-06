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
  assert.equal(report.checks.find((check) => check.id === "listing_detail_media_actions").status, "pass");
  assert.equal(report.checks.find((check) => check.id === "admin_and_market_languages").status, "pass");
});

test("generated mobile elderly QA report is valid when present", () => {
  const file = fromRoot("production", "data", "mobile-elderly-qa-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertMobileElderlyQaReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
