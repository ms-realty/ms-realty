// Synthetic unit fixtures adapted from the existing production-cutover tests. No live proof.
import { randomUUID, sign } from "node:crypto";
import { gates } from "../../scripts/launch-gate.mjs";
import { productionHosts } from "../../scripts/production-cutover.mjs";
import { accountId, launchBase, sha256 } from "../../scripts/staging-config.mjs";

export function productionFixture(owner, controller, at) {
  const clock = at;
  const keys = { owner, controller };
  const encode = (payload, role = "controller") => {
    const bytes = canonicalJson(payload);
    return {
      payload: bytes,
      signature: sign(null, Buffer.from(bytes), keys[role].privateKey).toString("base64"),
    };
  };
  const sourceCommit = "a".repeat(40),
    digest = `sha256:${"b".repeat(64)}`;
  const workerName = `ms-realty-production-${sourceCommit.slice(0, 12)}`;
  const baseline = {
    schemaVersion: 1,
    accountId,
    observedAt: new Date(clock).toISOString(),
    zones: [
      {
        id: "f0ac7af0721419e8129e5d10ff547372",
        name: "makler-realty.com",
        accountId,
        status: "active",
        ssl: "strict",
        dns: [
          {
            id: "80445b86dbd30e00238697e7be909ac0",
            name: "makler-realty.com",
            type: "A",
            content: "185.80.2.102",
            proxied: true,
            ttl: 1,
          },
          {
            id: "be450dc427bddd5e282d17f28ecace11",
            name: "www.makler-realty.com",
            type: "CNAME",
            content: "makler-realty.com",
            proxied: true,
            ttl: 1,
          },
          {
            id: "2".repeat(32),
            name: "makler-realty.com",
            type: "MX",
            content: "mail.makler-realty.com",
            priority: 0,
            ttl: 1800,
          },
          {
            id: "3".repeat(32),
            name: "makler-realty.com",
            type: "TXT",
            content: "v=spf1 fixture",
            ttl: 1800,
          },
        ],
        routes: [
          { id: "1".repeat(32), pattern: "makler-realty.com/*", script: null },
          { id: "2".repeat(32), pattern: "www.makler-realty.com/*", script: null },
          { id: "3".repeat(32), pattern: "makler-realty.com/en*", script: null },
          { id: "4".repeat(32), pattern: "makler-realty.com/", script: null },
          {
            id: "5".repeat(32),
            pattern: "staging.makler-realty.com/*",
            script: "ms-realty-staging",
          },
        ],
      },
      // Deliberately fictitious RU zone: this does not assert actual account ownership.
      {
        id: "c".repeat(32),
        name: "makler-realty.ru",
        accountId,
        status: "active",
        ssl: "strict",
        dns: [],
        routes: [],
      },
    ],
  };
  const runtime = { schemaVersion: 1, roles: {} },
    nonce = randomUUID();
  const database = {
    schemaVersion: 1,
    environment: "production",
    sourceCommit,
    digest,
    host: "db.production.test",
    schemaSha256: "c".repeat(64),
    measuredAt: new Date(clock).toISOString(),
    roles: {},
    migration: {
      status: "completed",
      operationId: randomUUID(),
      buildNonce: nonce,
      sourceCommit,
      digest,
    },
    compatibility: {
      mode: "expand-contract",
      rollbackCodeCompatible: true,
      acceptedWritesPreserved: true,
      evidenceSha256: "d".repeat(64),
    },
  };
  for (const [i, role] of ["web", "worker", "migrator"].entries()) {
    runtime.roles[role] = {
      schemaVersion: 1,
      role,
      sourceCommit,
      buildNonce: nonce,
      actorId: String(i + 1).repeat(64),
      state: role === "migrator" ? "completed" : "running",
    };
    const row = {
      database: "ms_realty_payload",
      role: `msr_${role}`,
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: "TLSv1.3",
      cipher: "fixture-cipher",
    };
    database.roles[role] = {
      actorId: runtime.roles[role].actorId,
      buildNonce: nonce,
      tlsVerification: "verify-full",
      drivers: { "postgres-js": { ...row }, pg: { ...row } },
    };
  }
  const plan = {
    schemaVersion: 1,
    environment: "production",
    purpose: "complete_parity",
    operationId: randomUUID(),
    accountId,
    sourceCommit,
    digest,
    workerName,
    gatewayVersionId: randomUUID(),
    gatewayDeploymentId: randomUUID(),
    image: `registry.cloudflare.com/${accountId}/ms-realty-staging@${digest}`,
    timeoutSeconds: 600,
    rollbackTimeoutSeconds: 120,
    databasePolicy: "preserve-current",
    dnsPolicy: "preserve-all",
    routes: [],
  };
  const leaseExpiry = new Date(clock + 2_000_000).toISOString(),
    recoveryPointId = randomUUID();
  const inputs = {
    schemaVersion: 1,
    environment: "production",
    runtime: "containers",
    purpose: "complete_parity",
    accountId,
    sourceCommit,
    workerName,
    image: plan.image,
    origins: {
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    },
    buckets: { media: "ms-realty-media", cache: "ms-realty-production-opennext-cache" },
    database: {
      name: "ms_realty_payload",
      host: database.host,
      engineVersion: "16.14",
      schemaSha256: database.schemaSha256,
      roles: { web: "msr_web", worker: "msr_worker", migrator: "msr_migrator" },
    },
  };
  const ownership = {
    schemaVersion: 1,
    environment: "production",
    operationId: plan.operationId,
    sourceCommit,
    digest,
    measuredAt: new Date(clock).toISOString(),
    routeLease: {
      holder: plan.operationId,
      id: randomUUID(),
      zoneIds: baseline.zones.map((z) => z.id),
      expiresAt: leaseExpiry,
      evidenceSha256: "e".repeat(64),
    },
    intake: {
      activeOwner: workerName,
      oldConsequentialWorkersDisabled: true,
      acceptedWritesLedgerSha256: "f".repeat(64),
    },
    databasePolicy: "preserve-current",
    recoveryPointId,
  };
  const recovery = {
    schemaVersion: 1,
    environment: "production",
    operationId: plan.operationId,
    recoveryPointId,
    retainDays: 90,
    legacyUntouched: true,
    evidenceSha256: "f".repeat(64),
    watchdog: {
      armed: true,
      operationId: plan.operationId,
      evidenceSha256: "e".repeat(64),
      expiresAt: leaseExpiry,
    },
  };
  for (const host of productionHosts) {
    const zone = baseline.zones.find((z) => host === z.name || host.endsWith(`.${z.name}`));
    const previous = zone.routes.find((r) => r.pattern === `${host}/*`);
    plan.routes.push({
      zoneId: zone.id,
      pattern: `${host}/*`,
      baselineRouteId: previous?.id ?? null,
    });
  }
  for (const previous of baseline.zones[0].routes.filter((r) =>
    ["makler-realty.com/en*", "makler-realty.com/"].includes(r.pattern),
  ))
    plan.routes.push({
      zoneId: baseline.zones[0].id,
      pattern: previous.pattern,
      baselineRouteId: previous.id,
    });
  const allGates = Object.fromEntries(
    gates.map((g) => [g, { status: "PASS", evidenceSha256: "e".repeat(64) }]),
  );
  const coverage = {
    productionAllowed: true,
    completeCurrentDelta: true,
    baselineSourceRows: 457,
    resolvedSourceRows: 457,
    exclusions: 0,
  };
  const report = {
    schemaVersion: 1,
    environment: "staging",
    status: "PASS",
    sourceCommit,
    digest,
    baseCommit: launchBase,
    coverage,
    gates: allGates,
    checker: { authority: "independent-controller", baselineSha256: "f".repeat(64) },
    checkedAt: new Date(clock - 1).toISOString(),
    rollback: { retainDays: 90, evidenceSha256: "e".repeat(64), legacyUntouched: true },
  };
  const bundle = {
    trustedKeys: {
      owner: owner.publicKey.export({ type: "spki", format: "pem" }),
      controller: controller.publicKey.export({ type: "spki", format: "pem" }),
    },
    approvals: {},
    artifacts: {},
    expected: {
      purpose: "complete_parity",
      sourceCommit,
      digest,
      inputsSha256: "a".repeat(64),
      provenanceSha256: "b".repeat(64),
    },
  };
  const f = {
    plan,
    baseline,
    runtime,
    database,
    inputs,
    ownership,
    recovery,
    bundle,
    report,
    encode,
  };
  f.refresh = () => {
    bundle.baseline = canonicalJson(baseline);
    plan.baselineSha256 = sha256(bundle.baseline);
    recovery.watchdog.baselineSha256 = plan.baselineSha256;
    bundle.artifacts = {
      gateway: "// UNIT FIXTURE gateway bytes",
      inputs: canonicalJson(inputs),
      routes: "[]",
      media: "[]",
      runtime: canonicalJson(runtime),
      database: canonicalJson(database),
      ownership: canonicalJson(ownership),
      recovery: canonicalJson(recovery),
    };
    plan.artifacts = Object.fromEntries(
      Object.entries(bundle.artifacts).map(([name, bytes]) => [name, sha256(bytes)]),
    );
    bundle.plan = canonicalJson(plan);
    for (const name of ["routesSha256", "mediaSha256"])
      bundle.expected[name] = plan.artifacts[name.replace("Sha256", "")];
    Object.assign(
      report,
      Object.fromEntries(
        ["routesSha256", "mediaSha256", "inputsSha256", "provenanceSha256"].map((k) => [
          k,
          bundle.expected[k],
        ]),
      ),
    );
    bundle.report = encode(report);
    for (const role of ["owner", "controller"])
      bundle.approvals[role] = encode(
        {
          role,
          decision: "approve",
          sourceCommit,
          digest,
          reportSha256: sha256(bundle.report.payload),
          reviewedScreens: true,
          signedAt: new Date(clock).toISOString(),
          cutoverPlanSha256: sha256(bundle.plan),
        },
        role,
      );
  };
  f.refresh();
  return f;
}

import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { evaluateRelease } from "./evaluate.ts";
import { prepareExecutionPlan } from "./execution-bridge.ts";
import { gatePolicySchema } from "./schemas.ts";
import {
  approvalEvidenceDigest,
  canonicalJson,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
  signEvidence,
} from "./signature.ts";

const proposed = gatePolicySchema.parse(
  JSON.parse(readFileSync("release/policy.single-operator.proposed.json", "utf8")),
);
const now = new Date(1_800_000_000_000 - 1_000);
const observedAt = new Date(now.getTime() - 60_000).toISOString();
const digest = sha256Digest("synthetic fixture bytes");
const owner = generateKeyPairSync("ed25519");
const machine = generateKeyPairSync("ed25519");
const watchdog = generateKeyPairSync("ed25519");
const ownerKeyId = "fixture-owner-key";
const machineKeyId = "fixture-machine-key";
const required = (value) => {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
};
const publicKey = (key) => key.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const humanPurposes = {
  authority_decision_record: "policy_ratification",
  release_attestation: "candidate_review",
  human_review: "human_review",
  listing_review_report: "human_review",
  recovery_owner_review: "recovery_review",
  operational_acceptance: "operational_acceptance",
};

function candidateScenario(production, phasePermissions) {
  const policy = structuredClone(proposed);
  if (policy.approvalModel?.mode !== "single_operator_owner_review") throw new Error("fixture");
  const model = policy.approvalModel;
  for (const field of ["amendments", "limitations", "phasePermissions"])
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
    {
      keyId: "fixture-watchdog-key",
      owner: "Fixture watchdog",
      publicKey: publicKey(watchdog),
      evidenceTypes: ["provider_check"],
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
  policy.approvalModel.phasePermissions.digest = sha256Digest(phasePermissions);
  const manifest = {
    schemaVersion: 1,
    product: "ms-realty",
    specVersion: policy.specVersion,
    releaseSha: "a".repeat(40),
    environment: "production",
    artifacts: {
      web: production.plan.digest,
      worker: production.plan.digest,
      migration: production.plan.digest,
      gateway: sha256Digest(production.bundle.artifacts.gateway),
    },
    revisions: {
      dependencies: sha256Digest("fixture dependencies"),
      model: "fixture",
      prompts: "fixture",
      schemas: "fixture",
    },
    providerAccounts: { synthetic: "fixture-account" },
    database: {
      schemaDigest: `sha256:${production.database.schemaSha256}`,
      lastMigration: "fixture-migration",
    },
    manifests: {
      domains: sha256Digest("fixture domains"),
      redirects: sha256Digest(production.bundle.artifacts.routes),
      media: sha256Digest(production.bundle.artifacts.media),
      dataImport: sha256Digest("fixture import"),
    },
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
    recoveryPoint: { id: production.ownership.recoveryPointId, sealedAt: observedAt },
    procedures: {
      cutover: { ref: "fixture/cutover", digest: sha256Digest("fixture cutover procedure") },
      rollback: { ref: "fixture/rollback", digest: sha256Digest("fixture rollback procedure") },
    },
  };
  const trust = {
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
  for (const artifact of evidence)
    if (artifact.type === "deployed_check") {
      artifact.digests.productionInputs = sha256Digest(production.bundle.artifacts.inputs);
      Object.assign(artifact, signArtifact(artifact));
    }
  const input = { policy, manifest, evidence, trust };
  seal(input);
  return input;
}

function artifactFor(policy, manifest, gateId, typeId) {
  const type = policy.evidenceTypes.find((type) => type.id === typeId);
  const gate = policy.gates.find((item) => item.id === gateId);
  const purpose = humanPurposes[typeId];
  return signArtifact({
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
    digests: { ...manifest.artifacts },
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
  });
}

function signArtifact(artifact) {
  return signEvidence(
    artifact,
    artifact.actor.kind === "human" ? owner.privateKey : machine.privateKey,
    artifact.actor.kind === "human" ? ownerKeyId : machineKeyId,
  );
}
function seal(input) {
  const pin = () => {
    input.manifest.evidenceIds = input.evidence.map((artifact) => artifact.id);
    input.manifest.evidenceDigests = Object.fromEntries(
      input.evidence.map((artifact) => [artifact.id, evidenceDigest(artifact)]),
    );
  };
  pin();
  const attestedEvidenceDigest = approvalEvidenceDigest(input.manifest);
  input.evidence = input.evidence.map((artifact) =>
    artifact.type === "release_attestation"
      ? signArtifact({ ...artifact, attestedEvidenceDigest })
      : artifact,
  );
  pin();
}

export function executionScenario() {
  const at = now.getTime() + 1_000;
  const production = productionFixture(owner, machine, at);
  const scope = { services: ["fixture"], regions: ["bg"], locales: ["bg"], channels: ["fixture"] };
  const key = (pair, keyId, purpose) => ({
    keyId,
    purpose,
    fingerprint: sha256Digest(Buffer.from(publicKey(pair), "base64")),
  });
  const keys = {
    owner: key(owner, ownerKeyId, "execution_grant"),
    verifier: key(machine, machineKeyId, "execution_verification"),
    watchdog: key(watchdog, "fixture-watchdog-key", "remote_lease_observation"),
  };
  const procedures = {
    cutover: "fixture cutover procedure",
    rollback: "fixture rollback procedure",
  };
  const phasePermissions = canonicalJson({
    schemaVersion: 1,
    execution: {
      action: "canonical_route_cutover",
      keysDigest: sha256Digest(canonicalJson(keys)),
      scopeDigest: sha256Digest(canonicalJson(scope)),
      procedures: Object.fromEntries(
        Object.entries(procedures).map(([name, value]) => [name, sha256Digest(value)]),
      ),
    },
  });
  const candidate = candidateScenario(production, phasePermissions);
  const encodeRaw = (payload, role) => {
    return {
      payload,
      signature: sign(
        null,
        Buffer.from(payload),
        { owner, verifier: machine, watchdog }[role].privateKey,
      ).toString("base64"),
    };
  };
  const encode = (value, role) => encodeRaw(canonicalJson(value), role);
  const lease = encode(
    {
      schemaVersion: 1,
      purpose: "remote_lease_observation",
      keyId: keys.watchdog.keyId,
      actor: { kind: "machine", name: "Fixture watchdog", version: "synthetic-1" },
      operationId: production.plan.operationId,
      leaseId: production.ownership.routeLease.id,
      sourceCommit: production.plan.sourceCommit,
      imageDigest: production.plan.digest,
      baselineDigest: sha256Digest(production.bundle.baseline),
      zoneIds: production.ownership.routeLease.zoneIds,
      state: "reserved",
      observedAt: new Date(at - 500).toISOString(),
      expiresAt: production.ownership.routeLease.expiresAt,
    },
    "watchdog",
  );
  production.ownership.routeLease.evidenceSha256 = sha256Digest(lease.payload).slice(7);
  production.recovery.watchdog.evidenceSha256 = sha256Digest(lease.payload).slice(7);
  production.refresh();
  const { approvals: _approvals, trustedKeys: _trusted, ...productionInput } = production.bundle;
  const preparation = {
    execution: "single_operator_owner_review",
    candidate: {},
    phasePermissions,
    procedures,
    candidateBytes: {
      domains: "fixture domains",
      dataImport: "fixture import",
      dependencies: "fixture dependencies",
    },
    production: productionInput,
    lease,
  };
  const admission = { release: candidate.trust, keys };
  const refreshCandidate = () => {
    seal(candidate);
    const evidence = candidate.evidence.map((artifact) => ({
      file: `${artifact.id}.json`,
      content: canonicalJson(artifact),
    }));
    preparation.candidate = {
      policy: candidate.policy,
      manifest: candidate.manifest,
      evidence,
      snapshot: evaluateRelease({
        policy: candidate.policy,
        manifest: candidate.manifest,
        evidence,
        admittedTrust: candidate.trust,
        now,
      }),
    };
  };
  refreshCandidate();
  const plan = prepareExecutionPlan(preparation, admission, new Date(at));
  const decision = (role) =>
    encode(
      {
        schemaVersion: 1,
        purpose: keys[role].purpose,
        keyId: keys[role].keyId,
        actor:
          role === "owner"
            ? { kind: "human", name: "Ivan" }
            : { kind: "machine", name: "Fixture checker", version: "synthetic-1" },
        action: "canonical_route_cutover",
        planDigest: sha256Digest(canonicalJson(plan)),
        snapshotId: plan.snapshotId,
        policyDigest: plan.policyDigest,
        contextDigest: plan.contextDigest,
        operationId: plan.operationId,
        leaseId: plan.leaseId,
        role: role === "owner" ? "owner" : "controller",
        decision: "approve",
        reviewedScreens: true,
        cutoverPlanSha256: plan.cutoverPlanDigest.slice(7),
        reportSha256: plan.parityReportDigest.slice(7),
        sourceCommit: plan.sourceCommit,
        digest: plan.images.web,
        signedAt: new Date(at).toISOString(),
        issuedAt: new Date(at).toISOString(),
        expiresAt: new Date(at + 60_000).toISOString(),
      },
      role,
    );
  const packet = {
    ...preparation,
    plan,
    grant: decision("owner"),
    verification: decision("verifier"),
  };
  return {
    packet,
    preparation,
    admission,
    at,
    encode,
    encodeRaw,
    candidate,
    refreshCandidate,
    production,
  };
}
