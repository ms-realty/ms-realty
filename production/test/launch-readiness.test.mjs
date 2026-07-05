import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertLaunchReadinessReport, buildLaunchReadinessReport } from "../lib/launch-readiness.mjs";
import { fromRoot } from "../lib/paths.mjs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(fromRoot(...path), "utf8"));
}

test("launch readiness stays blocked until production launch blockers are cleared", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, false);
  assert.deepEqual(report.blockers, ["redirect_reviews", "external_seo_exports"]);
  assert.ok(report.rollback_plan.length >= 3);
});

test("launch readiness validator accepts ready state after required gates are cleared", () => {
  const routeMap = readJson(["production", "data", "legacy-route-map.json"]);
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);
  const sources = seoEvidence.summary.sources;

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  seoEvidence.summary.missing_required_sources = [];
  for (const source of ["search_console", "yandex_webmaster", "backlinks"]) {
    sources[source] = {
      ...sources[source],
      status: "imported",
      row_count: 2,
      matched_rows: 2,
      unmatched_rows: 0,
      matched_source_domains: ["makler-realty.com", "makler-realty.ru"],
    };
  }

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
  });

  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, true);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.blockers, []);
});

test("generated launch readiness report is valid when present", () => {
  const file = fromRoot("production", "data", "launch-readiness.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertLaunchReadinessReport(report), true);
});
