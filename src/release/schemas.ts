// Release-evidence contracts (architecture §20.1, §20.3, §21.2, §21.3; D14): the release
// manifest, one evidence artifact, the gate policy and the readiness snapshot generated from
// them. Plain zod, no server-only import: the evaluator CLI, the readiness endpoint and the
// JSON Schema generator (scripts/release-schemas.mjs) all read these definitions.
import { z } from "zod";
import { evidenceEnvironments, redactionStatuses } from "@/domain/release-evidence";

export const gateIds = [
  "R00",
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "R11",
  "R12",
] as const;
export type GateId = (typeof gateIds)[number];

/** The gates of the retired launch contract that R00 must map (§21.2 item 1). */
export const legacyGateIds = [
  "crawl_inventory",
  "redirect_reviews",
  "localized_sitemap",
  "structured_data",
  "listing_quality_review",
  "runtime_smoke",
  "production_app_layer",
  "live_services",
  "monitoring_rollback",
  "payload_runtime",
  "r2_media_coverage",
  "production_recovery",
] as const;

/** AT01–AT68 (§20.2). */
export const acceptanceIdPattern = /^AT(0[1-9]|[1-5]\d|6[0-8])$/;

const gitSha = z.string().regex(/^[0-9a-f]{40}$/, "a full 40-character git SHA");
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/, "sha256:<64 hex>");
const instant = z.iso.datetime({ offset: true });
// Signed fields must not be normalized by parsing: verification covers the supplied value.
const name = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\S(?:[^\r\n]*\S)?$/);
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{3,128}$/);
export const evidenceClasses = ["test", "live", "human", "operator"] as const;
/** Not yet known. The evaluator reports every null as a manifest gap; it is never guessed. */
const known = <T extends z.ZodType>(schema: T) => schema.nullable();

const reference = z
  .object({
    /** Repository path or document URL of the procedure. */
    ref: name,
    digest,
  })
  .strict();

export const manifestApprovalRoles = ["operator", "reviewer"] as const;

export const releaseManifestSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    product: z.literal("ms-realty"),
    /** Product/spec version, e.g. `architecture-1.0`. */
    specVersion: name,
    releaseSha: gitSha,
    /** The environment this release is a candidate for. */
    environment: z.enum(evidenceEnvironments),
    artifacts: z
      .object({
        web: known(digest),
        worker: known(digest),
        migration: known(digest),
        gateway: known(digest),
      })
      .strict(),
    revisions: z
      .object({
        /** Lockfile digest. */
        dependencies: known(digest),
        model: known(name),
        prompts: known(name),
        schemas: known(name),
      })
      .strict(),
    /** Provider account references by provider (account ids or names, never secrets). */
    providerAccounts: z.record(z.string().min(1), known(name)),
    database: z
      .object({
        schemaDigest: known(digest),
        /** The last migration applied, e.g. `0003_search_projection_locale`. */
        lastMigration: known(name),
      })
      .strict(),
    manifests: z
      .object({
        domains: known(digest),
        redirects: known(digest),
        media: known(digest),
        dataImport: known(digest),
      })
      .strict(),
    scope: z
      .object({
        services: z.array(name),
        regions: z.array(name),
        locales: z.array(name),
        channels: z.array(name),
      })
      .strict(),
    policies: z
      .object({
        /** Must equal the gate policy's revision. */
        policyRevision: name,
        roles: known(name),
        retention: known(name),
        templates: known(name),
      })
      .strict(),
    /** Evidence bound to this release; evidence not listed here does not count. */
    evidenceIds: z.array(identifier),
    /** SHA-256 of canonical JSON including the signature, keyed by every evidence id. */
    evidenceDigests: z.record(identifier, digest),
    /** Named operator and reviewer approvals of this manifest. */
    approvals: z.array(
      z
        .object({
          role: z.enum(manifestApprovalRoles),
          name,
          approvedAt: instant,
          scope: z.literal("release"),
          /** A signed release_attestation by this approver, containing approval:<role>. */
          evidenceId: identifier,
        })
        .strict(),
    ),
    recoveryPoint: known(z.object({ id: identifier, sealedAt: instant }).strict()),
    procedures: z.object({ cutover: known(reference), rollback: known(reference) }).strict(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (new Set(manifest.evidenceIds).size !== manifest.evidenceIds.length) {
      ctx.addIssue({ code: "custom", path: ["evidenceIds"], message: "duplicate id" });
    }
    if (
      manifest.evidenceIds.toSorted().join() !== Object.keys(manifest.evidenceDigests).sort().join()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceDigests"],
        message: "must pin exactly the evidenceIds",
      });
    }
  });
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export const evidenceSignatureSchema = z
  .object({
    algorithm: z.literal("ed25519"),
    /** A key id from the policy's trustedKeys. */
    keyId: identifier,
    /** Base64 signature over the canonical JSON of the artifact without `signature`. */
    value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/, "canonical base64 Ed25519 signature"),
  })
  .strict();

export const evidenceArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    /** An evidence type id from the policy. */
    type: identifier,
    /** The gate this artifact is offered for. */
    gate: z.enum(gateIds),
    environment: z.enum(evidenceEnvironments),
    /** A fixture is test evidence even when it simulates a production deployment. */
    evidenceClass: z.enum(evidenceClasses),
    releaseSha: gitSha,
    /** Image, artifact and gateway digests observed, by manifest artifact name. */
    digests: z.record(z.string().min(1), digest),
    policyRevision: name,
    /** Canonical policy digest; a revision string alone does not pin its requirements/keys. */
    policyDigest: digest,
    /** releaseContextDigest(manifest): immutable candidate data/config/scope, before evidence. */
    dataDigest: digest,
    /** Release attestations additionally sign the manifest's non-approval evidence hash set. */
    attestedEvidenceDigest: known(digest),
    observedAt: instant,
    /** Optional producer expiry; policy freshness is enforced even if this is null. */
    expiresAt: known(instant),
    /** Tool or source identity that produced the observation, with its version. */
    source: name,
    /** The named human reviewer, where the evidence type requires one. */
    reviewer: known(name),
    assertions: z
      .array(
        z
          .object({
            /** An acceptance id (AT01–AT68) or a local check id. */
            id: z.string().min(1).max(80),
            passed: z.boolean(),
            detail: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .min(1),
    redactionStatus: z.enum(redactionStatuses),
    signature: evidenceSignatureSchema.optional(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (
      new Set(artifact.assertions.map((assertion) => assertion.id)).size !==
      artifact.assertions.length
    ) {
      ctx.addIssue({ code: "custom", path: ["assertions"], message: "duplicate assertion id" });
    }
    if (artifact.expiresAt && Date.parse(artifact.expiresAt) <= Date.parse(artifact.observedAt)) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "must follow observation" });
    }
  });
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;

/** `release` means the manifest's own environment. */
const acceptedEnvironment = z.enum([...evidenceEnvironments, "release"]);

export const gatePolicySchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    policyRevision: name,
    specVersion: name,
    /** Upper bound on a saved snapshot, even for evidence bound only by revision. */
    snapshotMaxAgeMinutes: z.number().int().positive().max(1440),
    /** Operators whose Ed25519 public keys verify signed evidence. Private keys never here. */
    trustedKeys: z.array(
      z
        .object({
          keyId: identifier,
          owner: name,
          /** Base64 DER SubjectPublicKeyInfo of an Ed25519 key. */
          publicKey: z
            .string()
            .regex(/^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$/, "base64 Ed25519 SPKI public key"),
          /** The evidence types this key may sign. */
          evidenceTypes: z.array(identifier).min(1),
        })
        .strict(),
    ),
    evidenceTypes: z.array(
      z
        .object({
          id: identifier,
          description: name,
          environments: z.array(acceptedEnvironment).min(1),
          classes: z.array(z.enum(evidenceClasses)).min(1),
          /** Each producer proves these checks itself; unrelated CI assertions cannot substitute. */
          requiredAssertions: z.array(z.string().min(1).max(80)).min(1),
          /** Oldest acceptable observation at evaluation; null = bound by release/revision. */
          maxAgeMinutes: z.number().int().positive().nullable(),
          signatureRequired: z.boolean(),
          reviewerRequired: z.boolean(),
          /** The artifact must carry every manifest artifact digest, all equal. */
          bindsArtifacts: z.boolean(),
        })
        .strict(),
    ),
    gates: z.array(
      z
        .object({
          id: z.enum(gateIds),
          title: name,
          stage: z.enum(["pre_cutover", "cutover", "post_cutover"]),
          exitEvidence: z.string().min(1),
          dependsOn: z.array(z.enum(gateIds)),
          requiredEvidence: z.array(identifier).min(1),
          requiredAssertions: z.array(z.string().min(1).max(80)),
          /** The manifest has no unknown field and both named approvals. */
          requiresCompleteManifest: z.boolean(),
          /** Every legacy replacement or retirement carries an approval counted for this gate. */
          requiresLegacyMapping: z.boolean(),
        })
        .strict(),
    ),
    legacyGates: z.array(
      z
        .object({
          id: z.enum(legacyGateIds),
          disposition: z.enum(["retained_obligation", "replacement_proof", "retirement"]),
          gates: z.array(z.enum(gateIds)),
          evidenceTypes: z.array(identifier),
          note: z.string().min(1),
          /**
           * Owner approval of a replacement or retirement: the R00 decision record that
           * accepted it. Null until approved; R00 stays blocked while any is null.
           */
          approval: known(
            z.object({ approvedBy: name, approvedAt: instant, evidenceId: identifier }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const types = new Set(policy.evidenceTypes.map((type) => type.id));
    if (types.size !== policy.evidenceTypes.length) issue(["evidenceTypes"], "duplicate id");
    const gates = policy.gates.map((gate) => gate.id);
    if (gates.join() !== gateIds.join()) issue(["gates"], "must list R00–R12 once, in order");
    policy.gates.forEach((gate, index) => {
      const mustDependOn =
        gate.id === "R00"
          ? []
          : gate.id === "R10"
            ? gateIds.slice(0, 10)
            : gate.id === "R11"
              ? ["R00", "R10"]
              : gate.id === "R12"
                ? ["R00", "R11"]
                : ["R00"];
      for (const dependency of mustDependOn) {
        if (!gate.dependsOn.includes(dependency as GateId))
          issue(["gates", index, "dependsOn"], `must require ${dependency}`);
      }
      if (gate.id === "R00" && !gate.requiresLegacyMapping)
        issue(["gates", index], "R00 must require legacy decisions");
      if (["R10", "R11", "R12"].includes(gate.id) && !gate.requiresCompleteManifest)
        issue(["gates", index], "release acceptance requires a complete manifest");
      if (gate.requiresLegacyMapping !== (gate.id === "R00"))
        issue(["gates", index], "R00 owns legacy decisions");
      for (const dependency of gate.dependsOn) {
        if (gates.indexOf(dependency) >= index) issue(["gates", index, "dependsOn"], "not earlier");
      }
      for (const type of gate.requiredEvidence) {
        if (!types.has(type)) issue(["gates", index, "requiredEvidence"], `unknown type ${type}`);
      }
    });
    const legacy = policy.legacyGates.map((gate) => gate.id).sort();
    if (legacy.join() !== [...legacyGateIds].sort().join()) {
      issue(["legacyGates"], "must map every legacy gate once");
    }
    policy.legacyGates.forEach((gate, index) => {
      if (gate.disposition !== "retirement" && (!gate.gates.length || !gate.evidenceTypes.length)) {
        issue(["legacyGates", index], "retained or replaced obligations need gates and proof");
      }
      for (const type of gate.evidenceTypes) {
        if (!types.has(type)) issue(["legacyGates", index, "evidenceTypes"], `unknown ${type}`);
        if (
          !policy.gates.some(
            (candidate) =>
              gate.gates.includes(candidate.id) && candidate.requiredEvidence.includes(type),
          )
        ) {
          issue(["legacyGates", index, "evidenceTypes"], `mapped gates must require ${type}`);
        }
      }
    });
    if (new Set(policy.trustedKeys.map((key) => key.keyId)).size !== policy.trustedKeys.length) {
      issue(["trustedKeys"], "duplicate key id");
    }
    if (
      new Set(policy.trustedKeys.map((key) => key.publicKey)).size !== policy.trustedKeys.length
    ) {
      issue(["trustedKeys"], "a signing key cannot impersonate multiple key identities");
    }
    const assertions = new Set(policy.gates.flatMap((gate) => gate.requiredAssertions));
    for (let id = 1; id <= 68; id += 1) {
      const acceptance = `AT${String(id).padStart(2, "0")}`;
      if (!assertions.has(acceptance)) issue(["gates"], `missing acceptance ${acceptance}`);
    }
    policy.trustedKeys.forEach((key, index) => {
      for (const type of key.evidenceTypes) {
        if (!types.has(type)) issue(["trustedKeys", index, "evidenceTypes"], `unknown ${type}`);
      }
    });
  });
export type GatePolicy = z.infer<typeof gatePolicySchema>;

export const gateStatuses = ["pass", "blocked"] as const;

export const readinessReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Digest over the complete canonical report without this snapshotId field. */
    snapshotId: digest,
    evaluatedAt: instant,
    expiresAt: instant,
    release: z
      .object({
        releaseSha: gitSha,
        environment: z.enum(evidenceEnvironments),
        specVersion: name,
        manifestDigest: digest,
        /** Manifest fields still unknown (JSON pointer paths) and missing approvals. */
        gaps: z.array(z.string()),
      })
      .strict(),
    policy: z.object({ policyRevision: name, policyDigest: digest }).strict(),
    verdict: z.enum(gateStatuses),
    gates: z.array(
      z
        .object({
          id: z.enum(gateIds),
          title: name,
          stage: z.enum(["pre_cutover", "cutover", "post_cutover"]),
          status: z.enum(gateStatuses),
          blockers: z.array(z.string()),
          evidenceIds: z.array(z.string()),
        })
        .strict(),
    ),
    evidence: z.array(
      z
        .object({
          file: z.string(),
          id: z.string().nullable(),
          type: z.string().nullable(),
          gate: z.string().nullable(),
          digest,
          artifactDigest: known(digest),
          counted: z.boolean(),
          reasons: z.array(z.string()),
        })
        .strict(),
    ),
    legacyGates: z.array(
      z
        .object({
          id: z.enum(legacyGateIds),
          disposition: z.string(),
          gates: z.array(z.enum(gateIds)),
          approved: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((report, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (report.gates.map((gate) => gate.id).join() !== gateIds.join())
      issue(["gates"], "must list R00–R12 once, in order");
    if (
      report.verdict !== (report.gates.every((gate) => gate.status === "pass") ? "pass" : "blocked")
    )
      issue(["verdict"], "must agree with all gates");
    if (
      report.verdict === "pass" &&
      (report.release.environment !== "production" || report.release.gaps.length > 0)
    )
      issue(["verdict"], "release acceptance needs complete production evidence");
    const lifespan = Date.parse(report.expiresAt) - Date.parse(report.evaluatedAt);
    if (lifespan <= 0 || lifespan > 1440 * 60_000)
      issue(["expiresAt"], "must expire within 24 hours of evaluation");
    report.gates.forEach((gate, index) => {
      if ((gate.status === "pass") !== (gate.blockers.length === 0))
        issue(["gates", index], "status must agree with blockers");
      if (gate.status === "pass" && !gate.evidenceIds.length)
        issue(["gates", index], "passing gates require counted evidence");
      for (const id of gate.evidenceIds) {
        if (
          !report.evidence.some((item) => item.id === id && item.gate === gate.id && item.counted)
        )
          issue(["gates", index], "gate references uncounted evidence");
      }
    });
    report.evidence.forEach((item, index) => {
      if (
        item.counted &&
        (!item.id || !item.type || !item.gate || !item.artifactDigest || item.reasons.length > 0)
      )
        issue(["evidence", index], "counted evidence must be valid");
      if (!item.counted && !item.reasons.length)
        issue(["evidence", index], "uncounted evidence needs a reason");
    });
    if (
      report.legacyGates
        .map((gate) => gate.id)
        .sort()
        .join() !== [...legacyGateIds].sort().join()
    )
      issue(["legacyGates"], "must map every legacy gate once");
  });
export type ReadinessReport = z.infer<typeof readinessReportSchema>;
