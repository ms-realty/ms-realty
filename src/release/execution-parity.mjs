// Pure protected-parity verification shared by local tooling and remote execution admission.
import { createHash, createPublicKey, verify } from "node:crypto";
import { rejectExecutionActivation } from "./execution-runtime.ts";
export const launchBase = "e23d17b1ce71fce694e823643ea94a7440dd4912";
export const accountId = "921d0224dcd595c87b7928d2b3c479d1";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const gates = [
  "urls",
  "listings",
  "content",
  "seo",
  "locales",
  "forms",
  "tracking",
  "performanceAccessibility",
  "security",
];
const demand = (ok, field) => {
  if (!ok) throw new Error(`Promotion blocked: ${field}`);
};
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function signedPayload(envelope, trustedPem) {
  const key = createPublicKey(trustedPem);
  demand(key.asymmetricKeyType === "ed25519", "reviewed Ed25519 signing custody");
  demand(
    typeof envelope?.payload === "string" &&
      typeof envelope.signature === "string" &&
      verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature, "base64")),
    "independent signature",
  );
  return JSON.parse(envelope.payload);
}
/** Verifies external evidence. Contains no checker implementation and cannot create a PASS. */
export function promotionGate(reportEnvelope, approvals, trustedKeys, expected, now = Date.now()) {
  // This validator checks parity only; a new execution packet cannot select a runtime mode.
  rejectExecutionActivation(expected);
  const fingerprints = [trustedKeys.controller, trustedKeys.owner].map((key) =>
    sha256(createPublicKey(key).export({ type: "spki", format: "der" })),
  );
  demand(fingerprints[0] !== fingerprints[1], "independent owner/controller keys");
  const report = signedPayload(reportEnvelope, trustedKeys.controller);
  const reportSha256 = sha256(reportEnvelope.payload);
  demand(
    expected.purpose === "complete_parity" &&
      report.coverage?.productionAllowed === true &&
      report.coverage.completeCurrentDelta === true &&
      Number.isInteger(report.coverage.baselineSourceRows) &&
      report.coverage.baselineSourceRows >= 457 &&
      report.coverage.resolvedSourceRows === report.coverage.baselineSourceRows &&
      report.coverage.exclusions === 0,
    "complete baseline coverage; partial staging previews cannot promote",
  );
  demand(
    report.schemaVersion === 1 &&
      report.environment === "staging" &&
      report.status === "PASS" &&
      report.checker?.authority === "independent-controller" &&
      hex(report.checker.baselineSha256),
    "independent staging report",
  );
  demand(
    report.baseCommit === launchBase &&
      /^[a-f0-9]{40}$/.test(expected.sourceCommit ?? "") &&
      report.sourceCommit === expected.sourceCommit &&
      report.digest === expected.digest &&
      /^sha256:[a-f0-9]{64}$/.test(report.digest),
    "same reviewed source and immutable digest",
  );
  for (const pin of ["routesSha256", "mediaSha256", "inputsSha256", "provenanceSha256"])
    demand(hex(expected[pin]) && report[pin] === expected[pin], `exact ${pin}`);
  demand(
    gates.every(
      (gate) => report.gates?.[gate]?.status === "PASS" && hex(report.gates[gate].evidenceSha256),
    ),
    "all nine gates independently PASS with pinned evidence",
  );
  const checked = Date.parse(report.checkedAt);
  demand(
    Number.isFinite(checked) && checked <= now && now - checked <= 86400000,
    "fresh staging report",
  );
  demand(
    report.rollback?.retainDays >= 90 &&
      hex(report.rollback.evidenceSha256) &&
      report.rollback.legacyUntouched === true,
    "untouched 90-day WordPress rollback",
  );
  for (const role of ["owner", "controller"]) {
    const approval = signedPayload(approvals[role], trustedKeys[role]);
    const signedAt = Date.parse(approval.signedAt);
    demand(
      approval.role === role &&
        approval.decision === "approve" &&
        approval.reportSha256 === reportSha256 &&
        approval.digest === expected.digest &&
        approval.sourceCommit === expected.sourceCommit &&
        approval.reviewedScreens === true &&
        Number.isFinite(signedAt) &&
        signedAt >= checked &&
        signedAt <= now,
      `${role} exact report/screens signoff`,
    );
  }
  return { digest: report.digest, sourceCommit: report.sourceCommit, reportSha256 };
}
