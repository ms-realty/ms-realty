// Evidence-class freshness. Monitoring evidence already expires after 24h,
// but payload-runtime, live-service, and recovery reports only required a
// structurally valid timestamp — so a report that passed months ago kept
// clearing its gate forever. This module names a max age per evidence class
// and reports (not enforces) staleness, so operators can see which proof is
// aging before it silently misrepresents production.
//
// Enforcement stays out of the gate evaluation deliberately: flipping a
// passing gate to blocked on a timer is a launch-day decision, not a
// refactor. `stalenessReport` is what the launch workbench and preflight
// surface today.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Chosen by how fast the underlying fact can change without anyone noticing.
export const EVIDENCE_CLASS_MAX_AGE_MS = Object.freeze({
  // A live monitoring/canary/rollback drill describes one release moment.
  monitoring_rollback: DAY_MS,
  // Live search/Hermes endpoints can be decommissioned or rotate keys.
  live_services: 7 * DAY_MS,
  // A database/runtime can be resized, rotated, or dropped.
  payload_runtime: 7 * DAY_MS,
  // Backup + restore drill: a monthly cadence is the operational promise.
  production_recovery: 30 * DAY_MS,
  // Human review of content is durable until the content itself changes.
  listing_quality_review: 90 * DAY_MS,
  external_seo_exports: 30 * DAY_MS,
});

export function maxAgeForEvidenceClass(evidenceClass) {
  return EVIDENCE_CLASS_MAX_AGE_MS[evidenceClass] ?? null;
}

export function evidenceFreshness(evidenceClass, generatedAt, { now = Date.now() } = {}) {
  const maxAgeMs = maxAgeForEvidenceClass(evidenceClass);
  if (maxAgeMs === null) return { id: evidenceClass, status: "unclassified" };
  const generatedAtMs = Date.parse(String(generatedAt || ""));
  if (Number.isNaN(generatedAtMs)) return { id: evidenceClass, status: "invalid", error: "generated_at is not a timestamp" };
  const ageMs = now - generatedAtMs;
  if (ageMs < -60_000) return { id: evidenceClass, status: "invalid", error: "generated_at is in the future" };
  return {
    id: evidenceClass,
    status: ageMs > maxAgeMs ? "stale" : "fresh",
    age_ms: Math.max(0, ageMs),
    max_age_ms: maxAgeMs,
  };
}

// entries: [{ id, generated_at }] — typically one per gate carrying evidence.
export function stalenessReport(entries = [], { now = Date.now() } = {}) {
  const checked = entries
    .filter((entry) => entry && entry.id)
    .map((entry) => evidenceFreshness(entry.id, entry.generated_at, { now }));
  return {
    kind: "evidence_freshness",
    stale: checked.filter((entry) => entry.status === "stale").map((entry) => entry.id),
    invalid: checked.filter((entry) => entry.status === "invalid").map((entry) => entry.id),
    checked,
  };
}
