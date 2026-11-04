// Read-only source inspection. Success deliberately returns no runtime capability.
import { createPublicKey, verify } from "node:crypto";
// Existing operator validators remain mandatory; their inputs are bound below.
// @ts-expect-error Existing Node operator script has no TypeScript declaration.
import { gates as parityGates } from "../../scripts/launch-gate.mjs";
// @ts-expect-error Existing Node operator script has no TypeScript declaration.
import { validateProductionCutover } from "../../scripts/production-cutover.mjs";
import { evaluateRelease } from "./evaluate";
import {
  executionAdmissionSchema,
  executionDecisionSchema,
  executionLeaseSchema,
  executionPacketSchema,
  executionPhaseSchema,
  executionPlanSchema,
  executionPreparationSchema,
  executionRawPlanSchema,
} from "./execution-contract";
import { evidenceArtifactSchema, gateIds } from "./schemas";
import { canonicalJson, releaseContextDigest, sha256Digest } from "./signature";

const demand = (ok: unknown, field: string): void => {
  if (!ok) throw new Error(`Execution inspection blocked: ${field}`);
};
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const hash = (value: unknown) => sha256Digest(canonicalJson(value));
const unprefix = (value: string) => value.slice("sha256:".length);
const canonicalBytes = (bytes: string, what: string) => {
  const value = JSON.parse(bytes);
  demand(canonicalJson(value) === bytes, `canonical ${what}; ambiguous JSON is not admitted`);
  return value;
};

function prepare(input: unknown, installedAdmission: unknown, now: Date) {
  const packet = executionPreparationSchema.parse(input);
  const admission = executionAdmissionSchema.parse(installedAdmission);
  const { policy, manifest, snapshot, evidence } = packet.candidate;
  const model = policy.approvalModel;
  demand(model?.mode === "single_operator_owner_review", "explicit admitted candidate mode");
  if (model?.mode !== "single_operator_owner_review") throw new Error("Candidate mode");
  demand(
    Number.isFinite(now.getTime()) &&
      Date.parse(snapshot.evaluatedAt) <= now.getTime() &&
      now.getTime() < Date.parse(snapshot.expiresAt),
    "original snapshot freshness; no future evaluation or extended expiry",
  );
  const evaluate = (at: Date) =>
    evaluateRelease({ policy, manifest, evidence, admittedTrust: admission.release, now: at });
  demand(same(snapshot, evaluate(new Date(snapshot.evaluatedAt))), "recomputed complete snapshot");
  const current = evaluate(now);
  for (const id of gateIds.slice(0, 11))
    demand(
      current.gates.find((gate) => gate.id === id)?.status === "pass",
      `${id} currently passes`,
    );
  demand(
    current.release.gaps.length === 0 &&
      manifest.environment === "production" &&
      current.evidence.every((item) => item.counted),
    "complete current candidate without uncounted or expanded evidence",
  );
  demand(
    snapshot.gates.slice(0, 11).every((gate) => gate.status === "pass"),
    "every frozen R00–R10 gate passes",
  );
  demand(
    sha256Digest(packet.phasePermissions) === model.phasePermissions?.digest,
    "actual R00-pinned phase-permission bytes",
  );
  const phase = executionPhaseSchema.parse(
    canonicalBytes(packet.phasePermissions, "phase permissions"),
  ).execution;
  demand(phase.keysDigest === hash(admission.keys), "ratified and installed key purposes");
  demand(phase.scopeDigest === hash(manifest.scope), "exact ratified scope");
  for (const name of ["cutover", "rollback"] as const)
    demand(
      sha256Digest(packet.procedures[name]) === manifest.procedures[name]?.digest &&
        phase.procedures[name] === manifest.procedures[name]?.digest,
      `actual permitted ${name} procedure bytes`,
    );
  for (const name of ["domains", "dataImport"] as const)
    demand(
      sha256Digest(packet.candidateBytes[name]) === manifest.manifests[name],
      `actual ${name} bytes`,
    );
  demand(
    sha256Digest(packet.candidateBytes.dependencies) === manifest.revisions.dependencies,
    "actual dependency bytes",
  );

  const keys = Object.fromEntries(
    Object.entries(admission.keys).map(([role, admitted]) => {
      const key = policy.trustedKeys.find((item) => item.keyId === admitted.keyId);
      demand(key, `installed ${role} key exists in admitted policy`);
      if (!key) throw new Error("Missing installed key");
      const der = Buffer.from(key.publicKey, "base64");
      demand(sha256Digest(der) === admitted.fingerprint, `installed ${role} fingerprint`);
      demand(key.actorKind === (role === "owner" ? "human" : "machine"), `${role} actor kind`);
      if (role === "owner")
        demand(
          key.owner === "Ivan" &&
            key.keyId === admission.release.ownerKeyId &&
            admitted.fingerprint === admission.release.ownerKeyFingerprint,
          "exact admitted Ivan authority",
        );
      const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
      demand(publicKey.asymmetricKeyType === "ed25519", `${role} Ed25519 custody`);
      return [role, { ...key, publicKey }];
    }),
  );
  demand(
    new Set(Object.values(admission.keys).map((key) => key.fingerprint)).size === 3,
    "distinct owner, machine verifier and remote watchdog keys",
  );
  const signed = (envelope: { payload: string; signature: string }, role: string) => {
    const key = keys[role];
    demand(key, "known signature role");
    if (!key) throw new Error("Missing signature role");
    const signature = Buffer.from(envelope.signature, "base64");
    demand(
      signature.length === 64 &&
        signature.toString("base64") === envelope.signature &&
        verify(null, Buffer.from(envelope.payload), key.publicKey, signature),
      `${role} genuine signature`,
    );
    const value = JSON.parse(envelope.payload);
    demand(envelope.payload === canonicalJson(value), `${role} canonical envelope`);
    return value;
  };
  const report = signed(packet.production.report, "verifier");
  demand(
    (parityGates as string[]).every(
      (gate) =>
        report.gates?.[gate]?.status === "PASS" &&
        /^[a-f0-9]{64}$/.test(report.gates[gate].evidenceSha256),
    ) &&
      report.coverage?.productionAllowed === true &&
      report.coverage.completeCurrentDelta === true &&
      report.coverage.exclusions === 0 &&
      Number.isInteger(report.coverage.baselineSourceRows) &&
      report.coverage.baselineSourceRows >= 457 &&
      report.coverage.resolvedSourceRows === report.coverage.baselineSourceRows,
    "complete nine-domain protected parity",
  );
  const rawPlan = executionRawPlanSchema.parse(
    canonicalBytes(packet.production.plan, "cutover plan"),
  );
  const baseline = canonicalBytes(packet.production.baseline, "production baseline");
  for (const name of ["inputs", "routes", "media", "runtime", "database", "ownership", "recovery"])
    canonicalBytes(packet.production.artifacts[name] ?? "", `${name} artifact`);
  demand(
    rawPlan.sourceCommit === manifest.releaseSha &&
      rawPlan.sourceCommit === packet.production.expected.sourceCommit &&
      rawPlan.digest === packet.production.expected.digest &&
      [manifest.artifacts.web, manifest.artifacts.worker, manifest.artifacts.migration].every(
        (digest) => digest === rawPlan.digest,
      ),
    "candidate source and immutable runtime images",
  );
  const gateway = packet.production.artifacts.gateway;
  const inputs = packet.production.artifacts.inputs;
  demand(
    gateway !== undefined && inputs !== undefined,
    "production gateway and configuration bytes",
  );
  if (gateway === undefined || inputs === undefined) throw new Error("Missing production bytes");
  demand(sha256Digest(gateway) === manifest.artifacts.gateway, "candidate gateway bytes");
  demand(
    evidence.some(({ content }) => {
      const artifact = evidenceArtifactSchema.parse(JSON.parse(content));
      return (
        artifact.type === "deployed_check" &&
        artifact.actor?.kind === "machine" &&
        artifact.environment === "production" &&
        artifact.digests.productionInputs === sha256Digest(inputs)
      );
    }),
    "counted candidate machine observation of the exact production configuration",
  );
  for (const [artifact, candidate] of [
    ["routes", "redirects"],
    ["media", "media"],
  ] as const)
    demand(
      sha256Digest(packet.production.artifacts[artifact] ?? "") === manifest.manifests[candidate],
      `candidate ${artifact} bytes`,
    );
  const database = JSON.parse(packet.production.artifacts.database ?? "null");
  demand(
    `sha256:${database?.schemaSha256}` === manifest.database.schemaDigest,
    "candidate database schema",
  );
  const lease = executionLeaseSchema.parse(signed(packet.lease, "watchdog"));
  demand(
    lease.keyId === admission.keys.watchdog.keyId &&
      lease.actor.name === keys.watchdog?.owner &&
      lease.operationId === rawPlan.operationId &&
      lease.sourceCommit === manifest.releaseSha &&
      lease.imageDigest === rawPlan.digest &&
      lease.baselineDigest === sha256Digest(packet.production.baseline) &&
      rawPlan.baselineSha256 === unprefix(lease.baselineDigest) &&
      new Set(lease.zoneIds).size === 2 &&
      same(
        [...lease.zoneIds].sort(),
        baseline.zones?.map((zone: { id: string }) => zone.id).sort(),
      ) &&
      Date.parse(lease.observedAt) >= Date.parse(snapshot.evaluatedAt) &&
      Date.parse(lease.observedAt) <= now.getTime() &&
      now.getTime() - Date.parse(lease.observedAt) < 60_000 &&
      Date.parse(lease.expiresAt) > now.getTime() + 720_000,
    "fresh authenticated exact remote lease and restoration reserve",
  );
  const ownership = JSON.parse(packet.production.artifacts.ownership ?? "null");
  demand(
    ownership?.routeLease?.id === lease.leaseId &&
      ownership.routeLease.holder === lease.operationId &&
      ownership.routeLease.expiresAt === lease.expiresAt &&
      ownership.routeLease.evidenceSha256 === unprefix(sha256Digest(packet.lease.payload)) &&
      ownership.recoveryPointId === manifest.recoveryPoint?.id,
    "same lease in concrete production plan",
  );
  const plan = executionPlanSchema.parse({
    schemaVersion: 1,
    action: phase.action,
    snapshotId: snapshot.snapshotId,
    policyDigest: snapshot.policy.policyDigest,
    contextDigest: releaseContextDigest(manifest),
    manifestDigest: snapshot.release.manifestDigest,
    phasePermissionsDigest: sha256Digest(packet.phasePermissions),
    scopeDigest: phase.scopeDigest,
    procedures: phase.procedures,
    sourceCommit: manifest.releaseSha,
    images: manifest.artifacts,
    cutoverPlanDigest: sha256Digest(packet.production.plan),
    baselineDigest: lease.baselineDigest,
    parityReportDigest: sha256Digest(packet.production.report.payload),
    operationId: lease.operationId,
    leaseId: lease.leaseId,
    leaseObservationDigest: sha256Digest(packet.lease.payload),
  });
  return { plan, packet, admission, keys, signed, lease };
}

/** Forms P after S; callers retain it for the separate actual owner decision. No signing. */
export function prepareExecutionPlan(input: unknown, installedAdmission: unknown, now: Date) {
  return prepare(input, installedAdmission, now).plan;
}

/** Verifies the conjunction without admitting, reserving, consuming or executing anything. */
export function inspectExecutionCandidate(input: unknown, installedAdmission: unknown, now: Date) {
  const supplied = executionPacketSchema.parse(input);
  const { plan: _plan, grant: _grant, verification: _verification, ...preparation } = supplied;
  const { plan, packet, admission, keys, signed, lease } = prepare(
    preparation,
    installedAdmission,
    now,
  );
  demand(same(supplied.plan, plan), "exact constructed P");
  for (const [role, envelope] of [
    ["owner", supplied.grant],
    ["verifier", supplied.verification],
  ] as const) {
    const decision = executionDecisionSchema.parse(signed(envelope, role));
    demand(
      decision.purpose === admission.keys[role].purpose &&
        decision.keyId === admission.keys[role].keyId &&
        decision.actor.kind === (role === "owner" ? "human" : "machine") &&
        decision.actor.name === keys[role]?.owner &&
        decision.role === (role === "owner" ? "owner" : "controller") &&
        decision.planDigest === hash(plan) &&
        decision.snapshotId === plan.snapshotId &&
        decision.policyDigest === plan.policyDigest &&
        decision.contextDigest === plan.contextDigest &&
        decision.operationId === plan.operationId &&
        decision.leaseId === plan.leaseId &&
        decision.cutoverPlanSha256 === unprefix(plan.cutoverPlanDigest) &&
        decision.reportSha256 === unprefix(plan.parityReportDigest) &&
        decision.sourceCommit === plan.sourceCommit &&
        decision.digest === plan.images.web &&
        decision.signedAt === decision.issuedAt &&
        Date.parse(decision.issuedAt) >= Date.parse(lease.observedAt) &&
        Date.parse(decision.issuedAt) <= now.getTime() &&
        now.getTime() < Date.parse(decision.expiresAt) &&
        Date.parse(decision.expiresAt) <= Date.parse(packet.candidate.snapshot.expiresAt) &&
        Date.parse(decision.expiresAt) <= Date.parse(lease.expiresAt),
      `${role} separate purpose, exact bindings and forward validity`,
    );
  }
  const trustedKeys = Object.fromEntries(
    [
      ["owner", "owner"],
      ["controller", "verifier"],
    ].map(([name, role]) => [
      name,
      keys[role ?? ""]?.publicKey.export({ type: "spki", format: "pem" }),
    ]),
  );
  validateProductionCutover(
    {
      ...packet.production,
      trustedKeys,
      approvals: { owner: supplied.grant, controller: supplied.verification },
    },
    now.getTime(),
  );
  return {
    inspection: "verified" as const,
    execution: "unavailable" as const,
    planDigest: hash(plan),
    snapshotId: plan.snapshotId,
    operationId: plan.operationId,
    leaseId: plan.leaseId,
    remaining: ["installed_trust_adapter", "durable_remote_admission_and_replay_fencing"],
  };
}
