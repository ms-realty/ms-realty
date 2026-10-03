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
const name = z.string().trim().min(1).max(200);
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{3,128}$/);
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
    /** Named operator and reviewer approvals of this manifest. */
    approvals: z.array(
      z
        .object({
          role: z.enum(manifestApprovalRoles),
          name,
          approvedAt: instant,
          scope: name,
        })
        .strict(),
    ),
    recoveryPoint: known(z.object({ id: identifier, sealedAt: instant }).strict()),
    procedures: z.object({ cutover: known(reference), rollback: known(reference) }).strict(),
  })
  .strict();
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export const evidenceSignatureSchema = z
  .object({
    algorithm: z.literal("ed25519"),
    /** A key id from the policy's trustedKeys. */
    keyId: identifier,
    /** Base64 signature over the canonical JSON of the artifact without `signature`. */
    value: z.string().min(1),
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
    releaseSha: gitSha,
    /** Image, artifact and gateway digests observed, by manifest artifact name. */
    digests: z.record(z.string().min(1), digest),
    policyRevision: name,
    /** Digest of the relevant data or configuration, when the observation depends on one. */
    dataDigest: known(digest),
    observedAt: instant,
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
  .strict();
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;

/** `release` means the manifest's own environment. */
const acceptedEnvironment = z.enum([...evidenceEnvironments, "release"]);

export const gatePolicySchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    policyRevision: name,
    specVersion: name,
    /** Operators whose Ed25519 public keys verify signed evidence. Private keys never here. */
    trustedKeys: z.array(
      z
        .object({
          keyId: identifier,
          owner: name,
          /** Base64 DER SubjectPublicKeyInfo of an Ed25519 key. */
          publicKey: z.string().min(1),
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
          requiredAssertions: z.array(z.string().regex(acceptanceIdPattern)),
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
      for (const type of gate.evidenceTypes) {
        if (!types.has(type)) issue(["legacyGates", index, "evidenceTypes"], `unknown ${type}`);
      }
    });
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
    /** Digest over the manifest, policy, evidence files and evaluation time. */
    snapshotId: digest,
    evaluatedAt: instant,
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
          stage: z.string(),
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
  .strict();
export type ReadinessReport = z.infer<typeof readinessReportSchema>;
