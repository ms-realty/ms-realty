// Readiness acceptance for a rollback. The snapshot taken before the release
// is the truth to reproduce. When the preserved monitoring evidence could not
// be re-attached ("drill" recovery), two exact states are acceptable for the
// restored release: the snapshot itself (evidence still valid, or the real
// drill already landed before this read) or the snapshot with
// monitoring_rollback added (recovery pending). Nothing is inferred from the
// dispatch; the state is read from the release. Unrelated blockers, other
// readiness values and marker checks are never relaxed here.
const EXPECTED_HTTP = { true: 200, false: 503 };

function sorted(values) {
  return [...new Set(values)].sort();
}

function readinessMatches(ready, httpStatus, { launchReady, blockers }) {
  return (
    ready?.service === "ms-realty" &&
    ready.launch_ready === launchReady &&
    ready.status === (launchReady ? "ready" : "blocked") &&
    Number(httpStatus) === EXPECTED_HTTP[String(launchReady)] &&
    JSON.stringify(Array.isArray(ready.blockers) ? sorted(ready.blockers) : []) === JSON.stringify(sorted(blockers))
  );
}

export function rollbackReadinessAccepts({ ready, httpStatus, expectedReady, expectedBlockers = [], recovery = "none" }) {
  const snapshot = { launchReady: expectedReady === true, blockers: expectedBlockers };
  if (readinessMatches(ready, httpStatus, snapshot)) return { accepted: true, state: "snapshot" };
  if (recovery === "drill") {
    const pending = { launchReady: false, blockers: [...expectedBlockers, "monitoring_rollback"] };
    if (readinessMatches(ready, httpStatus, pending)) return { accepted: true, state: "recovery_pending" };
  }
  return { accepted: false, state: "mismatch" };
}
