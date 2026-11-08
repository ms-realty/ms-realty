// Synthetic keys and invented observations only. No fixture is Ivan's signature or release proof.
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Test-only transport fixture shares existing synthetic signing keys.
import { syntheticBundle } from "./bundle-fixtures.mjs";
import { evaluateRelease, manifestGaps, ReleaseInputError } from "./evaluate";
import {
  type AdmittedReleaseTrust,
  type EvidenceArtifact,
  evidenceArtifactSchema,
  type GatePolicy,
  gatePolicySchema,
  manifestApprovalRoles,
  type ReleaseManifest,
  releaseManifestSchema,
} from "./schemas";
import {
  approvalEvidenceDigest,
  canonicalJson,
  checkSignature,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
  signEvidence,
} from "./signature";

const proposed = gatePolicySchema.parse(
  JSON.parse(readFileSync("release/policy.single-operator.proposed.json", "utf8")),
);
const legacy = gatePolicySchema.parse(JSON.parse(readFileSync("release/policy.json", "utf8")));
const now = new Date(1_800_000_000_000);
const observedAt = new Date(now.getTime() - 60_000).toISOString();
const digest = sha256Digest("synthetic fixture bytes");
const owner = generateKeyPairSync("ed25519");
const machine = generateKeyPairSync("ed25519");
const stranger = generateKeyPairSync("ed25519");
const ownerKeyId = "fixture-owner-key";
const machineKeyId = "fixture-machine-key";
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
};
const publicKey = (key: typeof owner) =>
  key.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const humanPurposes = {
  authority_decision_record: "policy_ratification",
  release_attestation: "candidate_review",
  human_review: "human_review",
  listing_review_report: "human_review",
  recovery_owner_review: "recovery_review",
  operational_acceptance: "operational_acceptance",
} as const;

function scenario(changePolicy?: (policy: GatePolicy) => void) {
  const policy = structuredClone(proposed);
  if (policy.approvalModel?.mode !== "single_operator_owner_review") throw new Error("fixture");
  const model = policy.approvalModel;
  for (const field of ["amendments", "limitations", "phasePermissions"] as const)
    model[field] = { ref: `fixture/${field}`, digest };
  policy.trustedKeys = [
    {
      keyId: ownerKeyId,
      owner: "Ivan",
      publicKey: publicKey(owner),
      evidenceTypes: Object.keys(humanPurposes),
      actorKind: "human",
      purposes: [...new Set(Object.values(humanPurposes)), "deployment_acceptance"],
    },
    {
      keyId: machineKeyId,
      owner: "Fixture checker",
      publicKey: publicKey(machine),
      evidenceTypes: policy.evidenceTypes
        .filter((type) => !(type.id in humanPurposes))
        .map((type) => type.id),
      actorKind: "machine",
      purposes: ["machine_observation"],
    },
  ];
  for (const legacy of policy.legacyGates)
    if (legacy.disposition !== "retained_obligation")
      legacy.approval = {
        approvedBy: "Ivan",
        approvedAt: observedAt,
        evidenceId: model.authorityEvidenceId,
      };
  changePolicy?.(policy);
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    product: "ms-realty",
    specVersion: policy.specVersion,
    releaseSha: "a".repeat(40),
    environment: "production",
    artifacts: { web: digest, worker: digest, migration: digest, gateway: digest },
    revisions: { dependencies: digest, model: "fixture", prompts: "fixture", schemas: "fixture" },
    providerAccounts: { synthetic: "fixture-account" },
    database: { schemaDigest: digest, lastMigration: "fixture-migration" },
    manifests: { domains: digest, redirects: digest, media: digest, dataImport: digest },
    scope: { services: ["fixture"], regions: ["bg"], locales: ["bg"], channels: ["fixture"] },
    policies: {
      policyRevision: policy.policyRevision,
      roles: "fixture",
      retention: "fixture",
      templates: "fixture",
    },
    evidenceIds: [],
    evidenceDigests: {},
    approvals: [
      {
        role: "owner_self_review",
        name: "Ivan",
        approvedAt: observedAt,
        scope: "release",
        evidenceId: "R10-release_attestation",
        purpose: "candidate_review",
      },
    ],
    recoveryPoint: { id: "fixture-recovery", sealedAt: observedAt },
    procedures: {
      cutover: { ref: "fixture/cutover", digest },
      rollback: { ref: "fixture/rollback", digest },
    },
  };
  const trust: AdmittedReleaseTrust = {
    schemaVersion: 1,
    policyDigest: sha256Digest(canonicalJson(policy)),
    trustedKeysDigest: sha256Digest(canonicalJson(policy.trustedKeys)),
    owner: "Ivan",
    ownerKeyId,
    ownerKeyFingerprint: sha256Digest(Buffer.from(publicKey(owner), "base64")),
    custodyReference: "fixture-only/external-trust-store",
  };
  const evidence = policy.gates
    .filter((gate) => !["R11", "R12"].includes(gate.id))
    .flatMap((gate) =>
      gate.requiredEvidence.map((typeId) => artifactFor(policy, manifest, gate.id, typeId)),
    );
  const input = { policy, manifest, evidence, trust };
  seal(input);
  const bundle = syntheticBundle(input, sign);
  return { ...input, bundle };
}

function artifactFor(
  policy: GatePolicy,
  manifest: ReleaseManifest,
  gateId: EvidenceArtifact["gate"],
  typeId: string,
): EvidenceArtifact {
  const type = policy.evidenceTypes.find((type) => type.id === typeId);
  const gate = policy.gates.find((gate) => gate.id === gateId);
  if (!type || !gate || policy.approvalModel?.mode !== "single_operator_owner_review")
    throw new Error("fixture");
  const purpose = humanPurposes[typeId as keyof typeof humanPurposes];
  const artifact: EvidenceArtifact = {
    schemaVersion: 1,
    id:
      typeId === "authority_decision_record"
        ? policy.approvalModel.authorityEvidenceId
        : `${gateId}-${typeId}`,
    type: typeId,
    gate: gateId,
    environment: type.environments.includes("release")
      ? manifest.environment
      : type.environments.includes("production")
        ? "production"
        : "ci",
    evidenceClass: required(type.classes[0]),
    releaseSha: manifest.releaseSha,
    digests: Object.fromEntries(Object.keys(manifest.artifacts).map((key) => [key, digest])),
    policyRevision: policy.policyRevision,
    policyDigest: sha256Digest(canonicalJson(policy)),
    dataDigest: releaseContextDigest(manifest),
    attestedEvidenceDigest: null,
    observedAt,
    expiresAt: null,
    source: "synthetic-fixture@1",
    actor: purpose
      ? { kind: "human", name: "Ivan" }
      : { kind: "machine", name: "Fixture checker", version: "synthetic@1" },
    purpose: purpose ?? "machine_observation",
    reviewer: purpose ? "Ivan" : "Fixture AI reviewer",
    assertions: [
      ...new Set([
        ...type.requiredAssertions,
        ...gate.requiredAssertions,
        ...(gateId === "R00" ? policy.legacyGates.map((legacy) => `legacy:${legacy.id}`) : []),
      ]),
    ].map((id) => ({ id, passed: true })),
    redactionStatus: "no_personal_data",
  };
  return sign(artifact);
}

function sign(artifact: EvidenceArtifact) {
  return signEvidence(
    artifact,
    artifact.actor?.kind === "human" ? owner.privateKey : machine.privateKey,
    artifact.actor?.kind === "human" ? ownerKeyId : machineKeyId,
  );
}

type Scenario = ReturnType<typeof scenario>;
function pin(input: Pick<Scenario, "manifest" | "evidence">) {
  input.manifest.evidenceIds = input.evidence.map((artifact) => artifact.id);
  input.manifest.evidenceDigests = Object.fromEntries(
    input.evidence.map((artifact) => [artifact.id, evidenceDigest(artifact)]),
  );
}
function seal(input: Pick<Scenario, "manifest" | "evidence">) {
  pin(input);
  const attestedEvidenceDigest = approvalEvidenceDigest(input.manifest);
  input.evidence = input.evidence.map((artifact) =>
    artifact.type === "release_attestation"
      ? sign({ ...artifact, attestedEvidenceDigest })
      : artifact,
  );
  pin(input);
}
function evaluate(input: Scenario, trust: unknown = input.trust) {
  return evaluateRelease({
    policy: input.policy,
    manifest: input.manifest,
    evidence: input.evidence.map((artifact) => ({
      file: `${artifact.id}.json`,
      content: canonicalJson(artifact),
    })),
    now,
    bundle: input.bundle,
    ...(trust === null ? {} : { admittedTrust: trust }),
  });
}
const gate = (report: ReturnType<typeof evaluate>, id: string) =>
  required(report.gates.find((gate) => gate.id === id));
const proof = (input: Scenario, id: string) =>
  required(input.evidence.find((artifact) => artifact.id === id));
const reasons = (report: ReturnType<typeof evaluate>, id: string) =>
  report.evidence.find((artifact) => artifact.id === id)?.reasons;

describe("R00 opt-in single-operator candidate foundation", () => {
  it("keeps draft-3 and the proposed file unratified, with no installed trust or keys", () => {
    expect(legacy.approvalModel).toBeUndefined();
    expect(legacy.trustedKeys).toEqual([]);
    expect(proposed.trustedKeys).toEqual([]);
    expect(proposed.legacyGates.every((gate) => gate.approval === null)).toBe(true);
    const manifest = JSON.parse(readFileSync("release/manifest.template.json", "utf8"));
    manifest.policies.policyRevision = proposed.policyRevision;
    const report = evaluateRelease({ manifest, policy: proposed, evidence: [], now });
    expect(report.gates.every((gate) => gate.status === "blocked")).toBe(true);
    expect(gate(report, "R00").blockers).toContain("single_operator_trust_unadmitted");
    expect(gate(report, "R00").blockers).toContain("single_operator_ratification_incomplete");
  });

  it("qualifies a synthetic R00–R10 candidate with exactly one owner self-review, never R11/R12 or execution", () => {
    const input = scenario();
    const report = evaluate(input);
    expect(
      report.gates.slice(0, 11).every((gate) => gate.status === "pass"),
      JSON.stringify(report),
    ).toBe(true);
    expect(report.release.gaps).toEqual([]);
    expect(report.verdict).toBe("blocked");
    for (const id of ["R11", "R12"])
      expect(gate(report, id).blockers).toContain(
        "single_operator_acceptance_bridge_unimplemented",
      );
    expect(input.manifest.approvals).toHaveLength(1);
    expect(
      proof(input, "R10-release_attestation").assertions.map((assertion) => assertion.id),
    ).not.toContain("release:cutover_approved");
  });

  it("cannot self-enroll a policy or its keys, even with otherwise valid signatures", () => {
    const input = scenario();
    expect(evaluate(input, null).gates.every((gate) => gate.status === "blocked")).toBe(true);
    for (const field of ["policyDigest", "trustedKeysDigest", "ownerKeyFingerprint"] as const) {
      const report = evaluate(input, { ...input.trust, [field]: sha256Digest(`wrong ${field}`) });
      expect(gate(report, "R00").status).toBe("blocked");
      expect(report.evidence.every((artifact) => !artifact.counted)).toBe(true);
    }
    expect(() => evaluate(input, { ...input.trust, owner: "Another owner" })).toThrow(
      ReleaseInputError,
    );
  });

  it("keeps even a fully signed fixture candidate blocked through the CLI without external admission", () => {
    const input = scenario();
    const directory = mkdtempSync(join(tmpdir(), "msr-single-operator-"));
    try {
      const evidenceDirectory = join(directory, "evidence");
      const output = join(directory, "output");
      mkdirSync(evidenceDirectory);
      writeFileSync(join(directory, "manifest.json"), JSON.stringify(input.manifest));
      writeFileSync(join(directory, "policy.json"), JSON.stringify(input.policy));
      for (const artifact of input.evidence)
        writeFileSync(join(evidenceDirectory, `${artifact.id}.json`), JSON.stringify(artifact));
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/release-evaluate.mjs",
          "--manifest",
          join(directory, "manifest.json"),
          "--policy",
          join(directory, "policy.json"),
          "--evidence",
          evidenceDirectory,
          "--out",
          output,
          "--now",
          now.toISOString(),
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(2);
      const report = JSON.parse(readFileSync(join(output, "readiness.json"), "utf8"));
      expect(report.gates.every((gate: { status: string }) => gate.status === "blocked")).toBe(
        true,
      );
      expect(gate(report, "R00").blockers).toContain("single_operator_trust_unadmitted");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["amendments", "limitations", "phasePermissions"] as const)(
    "requires ratified %s bytes even with pinned trust",
    (field) => {
      const input = scenario((policy) => {
        if (policy.approvalModel?.mode === "single_operator_owner_review")
          policy.approvalModel[field] = null;
      });
      expect(gate(evaluate(input), "R00").blockers).toContain(
        "single_operator_ratification_incomplete",
      );
    },
  );

  it("does not silently downgrade an externally admitted mode to separate reviewers", () => {
    const input = scenario();
    delete input.policy.approvalModel;
    const report = evaluate(input);
    expect(
      report.evidence.every((artifact) => artifact.reasons.includes("admitted_mode_mismatch")),
    ).toBe(true);
    expect(report.gates.every((gate) => gate.status === "blocked")).toBe(true);
  });

  it("requires the exact counted R00 authority and every model/limitation/phase assertion", () => {
    const input = scenario();
    const authority = required(
      input.evidence.find((artifact) => artifact.type === "authority_decision_record"),
    );
    authority.assertions = authority.assertions.filter(
      (assertion) => assertion.id !== "authority:phase_permissions",
    );
    input.evidence = input.evidence.map((artifact) =>
      artifact.id === authority.id ? sign(authority) : artifact,
    );
    seal(input);
    expect(gate(evaluate(input), "R00").blockers).toContain("single_operator_authority_unapproved");
    input.evidence = input.evidence.filter((artifact) => artifact.id !== authority.id);
    seal(input);
    expect(gate(evaluate(input), "R00").status).toBe("blocked");
  });

  it("rejects untrusted and wrong-purpose keys and machine signatures presented as human approval", () => {
    const wrongPurpose = scenario((policy) => {
      required(policy.trustedKeys[0]).purposes = [
        "policy_ratification",
        "human_review",
        "recovery_review",
      ];
    });
    expect(reasons(evaluate(wrongPurpose), "R10-release_attestation")).toContain("untrusted_key");
    for (const key of [stranger, machine]) {
      const input = scenario();
      input.evidence = input.evidence.map((artifact) =>
        artifact.type === "release_attestation"
          ? signEvidence(artifact, key.privateKey, machineKeyId)
          : artifact,
      );
      pin(input);
      expect(reasons(evaluate(input), "R10-release_attestation")).toContain("untrusted_key");
    }
    const input = scenario();
    const artifact = proof(input, "R02-listing_review_report");
    artifact.actor = { kind: "machine", name: "Fixture checker", version: "fixture@1" };
    artifact.purpose = "machine_observation";
    input.evidence = input.evidence.map((current) =>
      current.id === artifact.id ? sign(artifact) : current,
    );
    seal(input);
    expect(reasons(evaluate(input), artifact.id)).toContain("wrong_actor_kind");
    expect(gate(evaluate(input), "R02").status).toBe("blocked");
  });

  it("requires machine observation separately from owner authority", () => {
    const input = scenario();
    const artifact = proof(input, "R01-deployed_check");
    artifact.actor = { kind: "human", name: "Ivan" };
    artifact.purpose = "human_review";
    input.evidence = input.evidence.map((current) =>
      current.id === artifact.id ? sign(artifact) : current,
    );
    seal(input);
    expect(reasons(evaluate(input), artifact.id)).toContain("wrong_actor_kind");
    expect(gate(evaluate(input), "R01").status).toBe("blocked");
  });

  it("cannot turn a machine key into human authority by giving both keys Ivan's name", () => {
    const input = scenario((policy) => {
      const key = required(policy.trustedKeys[1]);
      key.owner = "Ivan";
      key.evidenceTypes.push("release_attestation");
    });
    const attestation = proof(input, "R10-release_attestation");
    const forged = signEvidence(attestation, machine.privateKey, machineKeyId);
    input.evidence = input.evidence.map((artifact) =>
      artifact.id === forged.id ? forged : artifact,
    );
    pin(input);
    expect(checkSignature(forged, input.policy)).toBe("untrusted_key");
    expect(gate(evaluate(input), "R10").status).toBe("blocked");
  });

  it.each(["missing", "duplicate", "extra", "wrong-owner"])(
    "rejects %s approval slots without excluding extra evidence from review",
    (kind) => {
      const input = scenario();
      const approval = required(input.manifest.approvals[0]);
      if (kind === "missing") input.manifest.approvals = [];
      if (kind === "duplicate") input.manifest.approvals.push({ ...approval });
      if (kind === "extra")
        input.manifest.approvals.push({
          ...approval,
          role: "reviewer",
          evidenceId: "R01-deployed_check",
        });
      if (kind === "wrong-owner") approval.name = "Another owner";
      seal(input);
      expect(gate(evaluate(input), "R10").status).toBe("blocked");
    },
  );

  it.each(["candidate-context", "policy", "evidence"])("rejects changed %s bindings", (kind) => {
    const input = scenario();
    if (kind === "candidate-context")
      input.manifest.procedures.cutover = {
        ref: "changed/procedure",
        digest: sha256Digest("changed bytes"),
      };
    if (kind === "policy") input.policy.policyRevision += "-changed";
    if (kind === "evidence") {
      const artifact = proof(input, "R01-ci_test_report");
      artifact.source = "changed-fixture@2";
      input.evidence = input.evidence.map((current) =>
        current.id === artifact.id ? sign(artifact) : current,
      );
      pin(input);
    }
    expect(gate(evaluate(input), "R10").status).toBe("blocked");
  });

  it("requires fresh complete-set approval for expanded proof and keeps the acceptance bridge held", () => {
    const input = scenario();
    const original = structuredClone(proof(input, "R10-release_attestation"));
    const context = releaseContextDigest(input.manifest);
    for (const gateId of ["R11", "R12"] as const) {
      const requiredTypes = required(
        input.policy.gates.find((gate) => gate.id === gateId),
      ).requiredEvidence;
      input.evidence.push(
        ...requiredTypes.map((type) => artifactFor(input.policy, input.manifest, gateId, type)),
      );
    }
    pin(input);
    expect(releaseContextDigest(input.manifest)).toBe(context);
    expect(approvalEvidenceDigest(input.manifest)).not.toBe(original.attestedEvidenceDigest);
    expect(evaluate(input).release.gaps).toContain("/approvals/owner_self_review/unverified");
    seal(input);
    const report = evaluate(input);
    expect(report.verdict).toBe("blocked");
    expect(gate(report, "R10").status).toBe("blocked");
    expect(gate(report, "R11").status).toBe("blocked");
    expect(gate(report, "R12").status).toBe("blocked");
  });

  it.each(["deployment_acceptance", "operational_acceptance"] as const)(
    "cannot use %s in a candidate review slot",
    (purpose) => {
      const input = scenario();
      required(input.manifest.approvals[0]).purpose = purpose;
      input.evidence = input.evidence.map((artifact) =>
        artifact.type === "release_attestation" ? sign({ ...artifact, purpose }) : artifact,
      );
      pin(input);
      expect(gate(evaluate(input), "R10").status).toBe("blocked");
    },
  );

  it("rejects a cutover-approval assertion in the candidate-only mode", () => {
    const input = scenario();
    const artifact = proof(input, "R10-release_attestation");
    artifact.assertions.push({ id: "release:cutover_approved", passed: true });
    input.evidence = input.evidence.map((current) =>
      current.id === artifact.id ? sign(artifact) : current,
    );
    pin(input);
    expect(reasons(evaluate(input), artifact.id)).toContain(
      "execution_authorization_not_supported",
    );
  });

  it("retains legacy roles, separate-person rejection and no parsing defaults", () => {
    expect(manifestApprovalRoles).toEqual(["operator", "reviewer"]);
    expect(canonicalJson(gatePolicySchema.parse(legacy))).toBe(canonicalJson(legacy));
    expect(
      gatePolicySchema.parse({ ...legacy, approvalModel: { mode: "separate_reviewers" } })
        .approvalModel,
    ).toEqual({ mode: "separate_reviewers" });
    const input = scenario();
    const approval = required(input.manifest.approvals[0]);
    input.manifest.approvals = [
      { ...approval, role: "operator" },
      { ...approval, role: "reviewer" },
    ];
    expect(manifestGaps(input.manifest, legacy)).toContain("/approvals/reviewer_not_separate");
    expect(canonicalJson(releaseManifestSchema.parse(input.manifest))).toBe(
      canonicalJson(input.manifest),
    );
    const artifact = required(input.evidence[0]);
    expect(canonicalJson(evidenceArtifactSchema.parse(artifact))).toBe(canonicalJson(artifact));
    expect(checkSignature(evidenceArtifactSchema.parse(artifact), input.policy)).toBe("valid");
    const oldArtifact = structuredClone(artifact);
    delete oldArtifact.actor;
    delete oldArtifact.purpose;
    const signedOldArtifact = signEvidence(oldArtifact, owner.privateKey, ownerKeyId);
    const legacyWithFixtureKey = {
      ...legacy,
      trustedKeys: [
        {
          keyId: ownerKeyId,
          owner: "Ivan",
          publicKey: publicKey(owner),
          evidenceTypes: [artifact.type],
        },
      ],
    };
    const parsedOldArtifact = evidenceArtifactSchema.parse(signedOldArtifact);
    expect(parsedOldArtifact).toEqual(signedOldArtifact);
    expect(Object.hasOwn(parsedOldArtifact, "actor")).toBe(false);
    expect(Object.hasOwn(parsedOldArtifact, "purpose")).toBe(false);
    expect(checkSignature(parsedOldArtifact, legacyWithFixtureKey)).toBe("valid");
    const original = JSON.parse(readFileSync("release/manifest.template.json", "utf8"));
    expect(releaseManifestSchema.parse(original)).toEqual(original);
  });

  it.each(["unknown", null, { mode: "single_operator_owner_review" }, { mode: "owner_bypass" }])(
    "rejects malformed or unknown approval models: %j",
    (approvalModel) => {
      expect(gatePolicySchema.safeParse({ ...proposed, approvalModel }).success).toBe(false);
    },
  );

  it("cannot enroll human approval purposes on a machine key or weaken required owner assertions", () => {
    const input = scenario();
    required(input.policy.trustedKeys[1]).purposes = ["candidate_review"];
    expect(gatePolicySchema.safeParse(input.policy).success).toBe(false);
    const policy = structuredClone(proposed);
    required(
      policy.evidenceTypes.find((type) => type.id === "release_attestation"),
    ).requiredAssertions = ["release:cutover_approved"];
    expect(gatePolicySchema.safeParse(policy).success).toBe(false);
  });
});
