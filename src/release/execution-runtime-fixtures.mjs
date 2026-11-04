// Synthetic test-only v2 runtime packets. No private key is read or exported.
import { loadExecutionAdmission } from "./execution-admission.ts";
import { prepareRuntimeExecutionPlan } from "./execution-bridge.ts";
import { executionScenario } from "./execution-fixtures.mjs";
import { canonicalJson, sha256Digest } from "./signature.ts";

const hash = (value) => sha256Digest(canonicalJson(value));
export function runtimeExecutionScenario() {
  const f = executionScenario();
  const keys = { owner: f.admission.keys.owner, verifier: f.admission.keys.verifier };
  const phase = JSON.parse(f.preparation.phasePermissions);
  phase.schemaVersion = 2;
  phase.execution.keysDigest = hash(keys);
  phase.execution.leaseAuthority = "watchdog_durable_state";
  phase.execution.recoveryAuthority = "original_operation_restore_and_separate_lease_release";
  phase.execution.conditionalAcceptance = "original_operation_complete_production_parity";
  f.preparation.phasePermissions = canonicalJson(phase);
  f.candidate.policy.approvalModel.phasePermissions.digest = sha256Digest(
    f.preparation.phasePermissions,
  );
  f.candidate.policy.trustedKeys = f.candidate.policy.trustedKeys.filter(
    (key) => key.keyId !== f.admission.keys.watchdog.keyId,
  );
  f.candidate.trust.policyDigest = hash(f.candidate.policy);
  f.candidate.trust.trustedKeysDigest = hash(f.candidate.policy.trustedKeys);
  f.resignCandidate();
  const admission = {
    schemaVersion: 2,
    mode: "single_operator_owner_review",
    leaseAuthority: "watchdog_durable_state",
    release: f.candidate.trust,
    keys,
  };
  const environment = {
    MS_REALTY_EXECUTION_ADMISSION: canonicalJson(admission),
    LAUNCH_OWNER_PUBLIC_KEY: f.production.bundle.trustedKeys.owner,
    LAUNCH_CONTROLLER_PUBLIC_KEY: f.production.bundle.trustedKeys.controller,
    WATCHDOG_OWNER_PUBLIC_KEY: f.production.bundle.trustedKeys.owner,
    WATCHDOG_CONTROLLER_PUBLIC_KEY: f.production.bundle.trustedKeys.controller,
  };
  const installed = loadExecutionAdmission(environment, "operator");
  const scope = {
    operationId: f.production.plan.operationId,
    leaseId: f.production.ownership.routeLease.id,
    sourceCommit: f.production.plan.sourceCommit,
    digest: f.production.plan.digest,
    baselineSha256: f.production.plan.baselineSha256,
    zoneIds: f.production.ownership.routeLease.zoneIds,
  };
  const lease = {
    scope,
    reservedAt: f.at,
    expiresAt: f.at + 1_800_000,
    status: "reserved",
    receipt: {
      schemaVersion: 1,
      accountId: f.production.plan.accountId,
      holder: scope.operationId,
      id: scope.leaseId,
      sourceCommit: scope.sourceCommit,
      digest: scope.digest,
      baselineSha256: scope.baselineSha256,
      zoneIds: [...scope.zoneIds].sort(),
      observedAt: new Date(f.at).toISOString(),
      expiresAt: new Date(f.at + 1_800_000).toISOString(),
      armed: true,
      custody: "account-wide-durable-object",
      writes: "signed-plan-only",
      serviceVersion: "synthetic-worker-version",
    },
  };
  const build = (actualLease = lease) => {
    f.production.ownership.routeLease.expiresAt = new Date(actualLease.expiresAt).toISOString();
    f.production.ownership.routeLease.evidenceSha256 = hash(actualLease.receipt).slice(7);
    f.production.recovery.watchdog.expiresAt = f.production.ownership.routeLease.expiresAt;
    f.production.recovery.watchdog.evidenceSha256 =
      f.production.ownership.routeLease.evidenceSha256;
    f.production.refresh();
    const { approvals: _approvals, trustedKeys: _trustedKeys, ...production } = f.production.bundle;
    const { lease: _lease, ...preparation } = f.preparation;
    const input = { ...preparation, protocolVersion: 2, production };
    const plan = prepareRuntimeExecutionPlan(input, installed, actualLease, new Date(f.at));
    const decision = (role) =>
      f.encode(
        {
          ...JSON.parse(f.packet[role === "owner" ? "grant" : "verification"].payload),
          schemaVersion: 2,
          admissionDigest: installed.digest,
          leaseAuthority: "watchdog_durable_state",
          planDigest: hash(plan),
          snapshotId: plan.snapshotId,
          policyDigest: plan.policyDigest,
          contextDigest: plan.contextDigest,
          operationId: plan.operationId,
          leaseId: plan.leaseId,
          cutoverPlanSha256: plan.cutoverPlanDigest.slice(7),
          reportSha256: plan.parityReportDigest.slice(7),
        },
        role,
      );
    return { ...input, plan, grant: decision("owner"), verification: decision("verifier") };
  };
  return { ...f, admission, installed, environment, scope, lease, build, packet: build() };
}
