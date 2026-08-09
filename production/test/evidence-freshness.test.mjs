import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_CLASS_MAX_AGE_MS,
  evidenceFreshness,
  maxAgeForEvidenceClass,
  stalenessReport,
} from "../lib/evidence-freshness.mjs";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const agoMs = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("every launch evidence class carries a max age", () => {
  for (const id of [
    "monitoring_rollback",
    "live_services",
    "payload_runtime",
    "production_recovery",
    "listing_quality_review",
    "external_seo_exports",
  ]) {
    assert.ok(EVIDENCE_CLASS_MAX_AGE_MS[id] > 0, `${id} needs a max age`);
  }
  assert.equal(maxAgeForEvidenceClass("monitoring_rollback"), DAY, "monitoring keeps its 24h contract");
  assert.equal(maxAgeForEvidenceClass("not_a_gate"), null);
});

test("freshness classifies evidence against its own class window", () => {
  assert.equal(evidenceFreshness("monitoring_rollback", agoMs(2 * HOUR), { now: NOW }).status, "fresh");
  assert.equal(evidenceFreshness("monitoring_rollback", agoMs(2 * DAY), { now: NOW }).status, "stale");
  // A payload runtime report is allowed a week, so two days is still fresh.
  assert.equal(evidenceFreshness("payload_runtime", agoMs(2 * DAY), { now: NOW }).status, "fresh");
  assert.equal(evidenceFreshness("payload_runtime", agoMs(8 * DAY), { now: NOW }).status, "stale");
  // Recovery drills get a month.
  assert.equal(evidenceFreshness("production_recovery", agoMs(20 * DAY), { now: NOW }).status, "fresh");
  assert.equal(evidenceFreshness("production_recovery", agoMs(40 * DAY), { now: NOW }).status, "stale");

  const fresh = evidenceFreshness("live_services", agoMs(HOUR), { now: NOW });
  assert.equal(fresh.age_ms, HOUR);
  assert.equal(fresh.max_age_ms, 7 * DAY);
});

test("invalid and unclassified inputs are reported, never silently passed", () => {
  assert.equal(evidenceFreshness("payload_runtime", "not-a-date", { now: NOW }).status, "invalid");
  assert.equal(evidenceFreshness("payload_runtime", undefined, { now: NOW }).status, "invalid");
  assert.equal(evidenceFreshness("payload_runtime", agoMs(-2 * DAY), { now: NOW }).status, "invalid", "future timestamps");
  assert.equal(evidenceFreshness("unknown_gate", agoMs(HOUR), { now: NOW }).status, "unclassified");
});

test("staleness report separates stale from invalid across gates", () => {
  const report = stalenessReport(
    [
      { id: "monitoring_rollback", generated_at: agoMs(30 * HOUR) },
      { id: "payload_runtime", generated_at: agoMs(HOUR) },
      { id: "production_recovery", generated_at: "nonsense" },
      { id: "live_services", generated_at: agoMs(9 * DAY) },
      null,
    ],
    { now: NOW },
  );
  assert.equal(report.kind, "evidence_freshness");
  assert.deepEqual(report.stale, ["monitoring_rollback", "live_services"]);
  assert.deepEqual(report.invalid, ["production_recovery"]);
  assert.equal(report.checked.length, 4, "null entries are dropped");
});
