// R10 transport proof. No I/O, evaluation, trust installation or human signing occurs here.
import { z } from "zod";
import {
  type EvidenceArtifact,
  evidenceArtifactSchema,
  type GatePolicy,
  type ReleaseManifest,
} from "./schemas";
import {
  canonicalJson,
  checkSignature,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
} from "./signature";

export const bundleLimits = Object.freeze({
  entries: 1024,
  components: 8,
  pathBytes: 256,
  jsonBytes: 2 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  payloadBytes: 256 * 1024 * 1024,
  jsonDepth: 32,
});
export const bundleWitnessTypes = [
  "evidence_bundle_capture",
  "evidence_bundle_verification",
] as const;
export const bundleProducer = "ms-realty-evidence-bundle@1";
export const bundleDigestNames = ["bundleIndex", "bundleCapture", "bundleVerification"] as const;
const hash = (value: unknown) => sha256Digest(canonicalJson(value));
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{3,128}$/);
const path = z.string().min(1).max(bundleLimits.pathBytes);
const entry = z.object({
  path,
  digest,
  bytes: z.number().int().nonnegative().max(bundleLimits.fileBytes),
});
export const bundleIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    format: z.literal("ms-realty-evidence-bundle"),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
    environment: z.enum(["production", "staging"]),
    policyDigest: digest,
    trustedKeysDigest: digest,
    contextDigest: digest,
    baseManifestDigest: digest,
    evidenceSetDigest: digest,
    entries: z
      .array(
        z.discriminatedUnion("role", [
          entry.extend({ role: z.literal("manifest") }).strict(),
          entry.extend({ role: z.literal("policy") }).strict(),
          entry
            .extend({ role: z.literal("evidence"), evidenceId: identifier, artifactDigest: digest })
            .strict(),
          entry
            .extend({
              role: z.literal("supporting"),
              references: z.array(z.string().min(1).max(200)).min(1).max(bundleLimits.entries),
            })
            .strict(),
        ]),
      )
      .min(2)
      .max(bundleLimits.entries),
  })
  .strict();
export type BundleIndex = z.infer<typeof bundleIndexSchema>;
export type BundleEntry = BundleIndex["entries"][number];
export const bundleBindingSchema = z
  .object({
    index: z.string().max(bundleLimits.jsonBytes),
    capture: z.string().max(bundleLimits.jsonBytes),
    verification: z.string().max(bundleLimits.jsonBytes),
  })
  .strict();
export type BundleBinding = z.infer<typeof bundleBindingSchema>;
export interface BundleEvidence {
  readonly file: string;
  readonly content: string;
}

/** Diagnostics never interpolate payload text, credentials, parser errors or filesystem paths. */
export class BundleError extends Error {
  constructor(readonly code: string) {
    super(`Evidence bundle: ${code}`);
  }
}
export function requireBundle(ok: unknown, code: string): asserts ok {
  if (!ok) throw new BundleError(code);
}

/** Conservative portable names also exclude hidden files, shell metacharacters and devices. */
export function validateBundlePath(value: string): void {
  requireBundle(Buffer.byteLength(value) <= bundleLimits.pathBytes, "path_length");
  const parts = value.split("/");
  requireBundle(parts.length <= bundleLimits.components, "path_depth");
  for (const part of parts)
    requireBundle(
      /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part) &&
        !part.endsWith(".") &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      "unsafe_path",
    );
}

/** Duplicate-aware JSON decoder; JSON.parse alone silently discards conflicting signed keys. */
export function parseBundleJson(bytes: Uint8Array | string, canonical = false): unknown {
  const raw = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  requireBundle(raw.byteLength <= bundleLimits.jsonBytes, "json_size");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    throw new BundleError("invalid_utf8");
  }
  if (typeof bytes === "string") requireBundle(text === bytes, "invalid_utf8");
  let offset = 0;
  const whitespace = () => {
    while (/[\x20\t\r\n]/.test(text[offset] ?? "!")) offset++;
  };
  const string = (): string => {
    const begin = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === "\\") offset++;
      else if (char === '"') {
        let value: string;
        try {
          value = JSON.parse(text.slice(begin, offset));
        } catch {
          throw new BundleError("invalid_json");
        }
        requireBundle(Buffer.from(value).toString("utf8") === value, "invalid_unicode");
        return value;
      }
    }
    throw new BundleError("invalid_json");
  };
  const value = (depth: number): unknown => {
    requireBundle(depth <= bundleLimits.jsonDepth, "json_depth");
    whitespace();
    const char = text[offset];
    if (char === '"') return string();
    if (char === "{" || char === "[") {
      offset++;
      const object: Record<string, unknown> = Object.create(null);
      const array: unknown[] = [];
      const keys = new Set<string>();
      const end = char === "{" ? "}" : "]";
      whitespace();
      if (text[offset] === end) {
        offset++;
        return char === "{" ? object : array;
      }
      for (;;) {
        whitespace();
        if (char === "{") {
          requireBundle(text[offset] === '"', "invalid_json");
          const key = string();
          requireBundle(!keys.has(key), "duplicate_json_key");
          keys.add(key);
          whitespace();
          requireBundle(text[offset++] === ":", "invalid_json");
          object[key] = value(depth + 1);
        } else array.push(value(depth + 1));
        whitespace();
        if (text[offset] === end) {
          offset++;
          break;
        }
        requireBundle(text[offset++] === ",", "invalid_json");
      }
      return char === "{" ? object : array;
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(offset),
    );
    requireBundle(literal, "invalid_json");
    offset += literal[0].length;
    const parsed = JSON.parse(literal[0]);
    requireBundle(typeof parsed !== "number" || Number.isFinite(parsed), "invalid_number");
    return parsed;
  };
  const result = value(0);
  whitespace();
  requireBundle(offset === text.length, "invalid_json");
  if (canonical) requireBundle(canonicalJson(result) === text, "noncanonical_control");
  return result;
}

export function parseBundleIndex(bytes: string): BundleIndex {
  const parsed = bundleIndexSchema.safeParse(parseBundleJson(bytes, true));
  requireBundle(parsed.success, "index_schema");
  const index = parsed.data;
  const names = new Set<string>();
  const prefixes = new Map<string, string>();
  let total = 0;
  let prior = "";
  for (const item of index.entries) {
    validateBundlePath(item.path);
    requireBundle(item.path > prior, "inventory_order_or_duplicate");
    prior = item.path;
    const lower = item.path.toLowerCase();
    requireBundle(!names.has(lower), "portable_path_collision");
    names.add(lower);
    const parts = item.path.split("/");
    for (let count = 1; count <= parts.length; count++) {
      const prefix = parts.slice(0, count).join("/");
      const previous = prefixes.get(prefix.toLowerCase());
      requireBundle(previous === undefined || previous === prefix, "portable_path_collision");
      prefixes.set(prefix.toLowerCase(), prefix);
      if (count < parts.length)
        requireBundle(!names.has(prefix.toLowerCase()), "path_file_collision");
    }
    if (item.role !== "supporting")
      requireBundle(item.bytes <= bundleLimits.jsonBytes, "json_size");
    total += item.bytes;
    requireBundle(total <= bundleLimits.payloadBytes, "payload_size");
  }
  for (const role of ["policy", "manifest"])
    requireBundle(
      index.entries.filter((item) => item.role === role).length === 1,
      "control_inventory",
    );
  return index;
}

/** These are document/receipt references, unlike named revisions or image observations. */
export function bundleReferences(
  manifest: ReleaseManifest,
  policy: GatePolicy,
  evidence: readonly EvidenceArtifact[],
) {
  const references = new Map<string, string>();
  const model = policy.approvalModel;
  const all = [
    manifest.procedures.cutover,
    manifest.procedures.rollback,
    ...(model?.mode === "single_operator_owner_review"
      ? [model.amendments, model.limitations, model.phasePermissions]
      : []),
    ...evidence.flatMap((artifact) => artifact.supportingFiles ?? []),
  ];
  for (const ref of all) {
    requireBundle(ref, "reference_missing");
    requireBundle(
      !references.has(ref.ref) || references.get(ref.ref) === ref.digest,
      "conflicting_reference",
    );
    references.set(ref.ref, ref.digest);
  }
  return references;
}

export function validateBundleIndex(
  index: BundleIndex,
  manifest: ReleaseManifest,
  policy: GatePolicy,
  files: readonly BundleEvidence[],
) {
  requireBundle(manifest.approvals.length === 0, "base_approval_not_empty");
  requireBundle(
    index.releaseSha === manifest.releaseSha &&
      index.environment === manifest.environment &&
      index.contextDigest === releaseContextDigest(manifest) &&
      index.policyDigest === hash(policy) &&
      index.trustedKeysDigest === hash(policy.trustedKeys) &&
      index.baseManifestDigest === hash(manifest) &&
      index.evidenceSetDigest === hash(manifest.evidenceDigests),
    "index_candidate_binding",
  );
  const rows = index.entries.filter((item) => item.role === "evidence");
  requireBundle(
    rows.length === files.length && rows.length === manifest.evidenceIds.length,
    "evidence_inventory_count",
  );
  const seen = new Set<string>();
  const seenPaths = new Set<string>();
  const artifacts = files.map((file) => {
    const parsed = evidenceArtifactSchema.safeParse(parseBundleJson(file.content));
    requireBundle(parsed.success, "evidence_schema");
    const artifact = parsed.data;
    requireBundle(
      !bundleWitnessTypes.some((type) => type === artifact.type),
      "transport_in_evidence",
    );
    requireBundle(!seen.has(artifact.id) && !seenPaths.has(file.file), "duplicate_evidence");
    seen.add(artifact.id);
    seenPaths.add(file.file);
    const row = rows.find((entry) => entry.evidenceId === artifact.id);
    requireBundle(
      row &&
        row.path === file.file &&
        row.bytes === Buffer.byteLength(file.content) &&
        row.digest === sha256Digest(file.content) &&
        row.artifactDigest === evidenceDigest(artifact) &&
        manifest.evidenceDigests[artifact.id] === row.artifactDigest,
      "evidence_byte_binding",
    );
    return artifact;
  });
  requireBundle(
    manifest.evidenceIds.every((id) => seen.has(id)),
    "evidence_inventory_ids",
  );
  const references = bundleReferences(manifest, policy, artifacts);
  const bound = new Set<string>();
  for (const item of index.entries) {
    if (item.role !== "supporting") continue;
    for (const ref of item.references) {
      requireBundle(
        !bound.has(ref) && references.get(ref) === item.digest,
        "supporting_reference_binding",
      );
      bound.add(ref);
    }
  }
  requireBundle(bound.size === references.size, "supporting_reference_missing");
  return artifacts;
}

/** Fresh capture does not rejuvenate observations or the original recovery sealing time. */
export function bundleExpiry(
  manifest: ReleaseManifest,
  policy: GatePolicy,
  evidence: readonly EvidenceArtifact[],
  at: Date,
): number {
  const limits = [at.getTime() + policy.snapshotMaxAgeMinutes * 60_000];
  for (const artifact of evidence) {
    const age = policy.evidenceTypes.find((type) => type.id === artifact.type)?.maxAgeMinutes;
    if (age != null) limits.push(Date.parse(artifact.observedAt) + age * 60_000);
    if (artifact.expiresAt) limits.push(Date.parse(artifact.expiresAt));
  }
  const age = policy.evidenceTypes.find((type) => type.id === "recovery_point")?.maxAgeMinutes;
  if (manifest.recoveryPoint && age != null)
    limits.push(Date.parse(manifest.recoveryPoint.sealedAt) + age * 60_000);
  return Math.min(...limits);
}

export function bundleWitness(input: {
  index: string;
  manifest: ReleaseManifest;
  policy: GatePolicy;
  evidence: readonly EvidenceArtifact[];
  at: Date;
  actor: { kind: "machine"; name: string; version: string };
  capture?: string;
}): EvidenceArtifact {
  const { manifest, policy, at, capture } = input;
  const type = capture === undefined ? bundleWitnessTypes[0] : bundleWitnessTypes[1];
  const index = parseBundleIndex(input.index);
  const age = policy.evidenceTypes.find((item) => item.id === type)?.maxAgeMinutes;
  const expiry = Math.min(
    bundleExpiry(manifest, policy, input.evidence, at),
    age == null ? Infinity : at.getTime() + age * 60_000,
    capture === undefined ? Infinity : Date.parse(parseWitness(capture).expiresAt ?? ""),
  );
  requireBundle(Number.isFinite(expiry) && expiry > at.getTime(), "witness_expired");
  return evidenceArtifactSchema.parse({
    schemaVersion: 1,
    id: `${capture === undefined ? "capture" : "verification"}-${sha256Digest(input.index).slice(7, 39)}`,
    type,
    gate: "R10",
    environment: manifest.environment,
    evidenceClass: "live",
    releaseSha: manifest.releaseSha,
    policyRevision: policy.policyRevision,
    policyDigest: hash(policy),
    dataDigest: releaseContextDigest(manifest),
    attestedEvidenceDigest: index.evidenceSetDigest,
    digests: {
      ...manifest.artifacts,
      bundleIndex: sha256Digest(input.index),
      ...(capture === undefined ? {} : { bundleCapture: sha256Digest(capture) }),
    },
    observedAt: at.toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    source: bundleProducer,
    actor: input.actor,
    purpose: "machine_observation",
    reviewer: null,
    assertions: [
      {
        id:
          capture === undefined ? "bundle:copied_bytes_verified" : "bundle:reopened_bytes_verified",
        passed: true,
      },
    ],
    redactionStatus: "no_personal_data",
  });
}

function parseWitness(bytes: string): EvidenceArtifact {
  const parsed = evidenceArtifactSchema.safeParse(parseBundleJson(bytes, true));
  requireBundle(parsed.success, "witness_schema");
  return parsed.data;
}

export function validateBundleTransport(input: {
  index: string;
  capture: string;
  verification?: string;
  manifest: ReleaseManifest;
  policy: GatePolicy;
  evidence: readonly BundleEvidence[];
  now: Date;
}) {
  const index = parseBundleIndex(input.index);
  const artifacts = validateBundleIndex(index, input.manifest, input.policy, input.evidence);
  let expiry = Infinity;
  let previousTime = -Infinity;
  const ids = new Set(input.manifest.evidenceIds);
  const witnesses = [input.capture, input.verification];
  for (const [i, bytes] of witnesses.entries()) {
    if (bytes === undefined) continue;
    const witness = parseWitness(bytes);
    const type = input.policy.evidenceTypes.find(
      (candidate) => candidate.id === bundleWitnessTypes[i],
    );
    const assertion = i === 0 ? "bundle:copied_bytes_verified" : "bundle:reopened_bytes_verified";
    requireBundle(
      type?.signatureRequired &&
        type.bindsArtifacts &&
        !type.reviewerRequired &&
        type.environments.includes("release") &&
        type.classes.includes("live") &&
        type.requiredAssertions.includes(assertion),
      "witness_policy_scope",
    );
    requireBundle(
      witness.type === type.id &&
        witness.gate === "R10" &&
        witness.environment === input.manifest.environment &&
        witness.evidenceClass === "live" &&
        witness.actor?.kind === "machine" &&
        witness.purpose === "machine_observation" &&
        witness.reviewer === null &&
        witness.source === bundleProducer &&
        witness.redactionStatus === "no_personal_data" &&
        checkSignature(witness, input.policy) === "valid",
      "witness_authority",
    );
    requireBundle(!ids.has(witness.id), "witness_duplicate_id");
    ids.add(witness.id);
    requireBundle(
      witness.releaseSha === index.releaseSha &&
        witness.policyRevision === input.policy.policyRevision &&
        witness.policyDigest === index.policyDigest &&
        witness.dataDigest === index.contextDigest &&
        witness.attestedEvidenceDigest === index.evidenceSetDigest &&
        canonicalJson(witness.digests) ===
          canonicalJson({
            ...input.manifest.artifacts,
            bundleIndex: sha256Digest(input.index),
            ...(i === 0 ? {} : { bundleCapture: sha256Digest(input.capture) }),
          }),
      "witness_binding",
    );
    requireBundle(
      witness.assertions.every((item) => item.passed) &&
        type.requiredAssertions.every((id) =>
          witness.assertions.some((item) => item.id === id && item.passed),
        ),
      "witness_assertions",
    );
    const observed = Date.parse(witness.observedAt);
    const expires = Date.parse(witness.expiresAt ?? "");
    requireBundle(
      observed >= previousTime &&
        observed <= input.now.getTime() + 300_000 &&
        expires > input.now.getTime() &&
        expires <= expiry &&
        expires <= bundleExpiry(input.manifest, input.policy, artifacts, new Date(observed)) &&
        (type.maxAgeMinutes === null || expires <= observed + type.maxAgeMinutes * 60_000) &&
        (type.maxAgeMinutes === null ||
          input.now.getTime() - observed < type.maxAgeMinutes * 60_000),
      "witness_freshness",
    );
    previousTime = observed;
    expiry = Math.min(
      expires,
      type.maxAgeMinutes === null ? Infinity : observed + type.maxAgeMinutes * 60_000,
    );
  }
  return { expiresAt: expiry, observedAt: previousTime, index };
}

/** Exactly one valid current slot must be established before anything is excluded from E. */
export function bundleBaseManifest(manifest: ReleaseManifest): ReleaseManifest {
  const approval = manifest.approvals[0];
  requireBundle(
    manifest.approvals.length === 1 &&
      approval?.role === "owner_self_review" &&
      approval.name === "Ivan" &&
      approval.purpose === "candidate_review" &&
      manifest.evidenceIds.includes(approval.evidenceId),
    "owner_slot",
  );
  return {
    ...manifest,
    approvals: [],
    evidenceIds: manifest.evidenceIds.filter((id) => id !== approval.evidenceId),
    evidenceDigests: Object.fromEntries(
      Object.entries(manifest.evidenceDigests).filter(([id]) => id !== approval.evidenceId),
    ),
  };
}

/** Shared by direct evaluation and the execution bridge; no cached success label is accepted. */
export function validateBundleBinding(input: {
  bundle: unknown;
  manifest: ReleaseManifest;
  policy: GatePolicy;
  evidence: readonly BundleEvidence[];
  now: Date;
}): { problems: string[]; expiresAt?: number } {
  if (input.bundle === undefined) return { problems: ["bundle_binding_missing"] };
  try {
    const proof = bundleBindingSchema.safeParse(input.bundle);
    requireBundle(proof.success, "binding_schema");
    const manifest = bundleBaseManifest(input.manifest);
    const approval = input.manifest.approvals[0];
    requireBundle(approval, "owner_slot");
    const all = input.evidence.map((file) => ({
      file,
      artifact: evidenceArtifactSchema.parse(parseBundleJson(file.content)),
    }));
    const approvals = all.filter((item) => item.artifact.id === approval.evidenceId);
    requireBundle(approvals.length === 1, "owner_artifact");
    const owner = approvals[0]?.artifact;
    requireBundle(
      owner &&
        owner.type === "release_attestation" &&
        owner.gate === "R10" &&
        owner.actor?.kind === "human" &&
        owner.actor.name === "Ivan" &&
        owner.reviewer === "Ivan" &&
        owner.purpose === "candidate_review" &&
        owner.observedAt === approval.approvedAt &&
        Date.parse(owner.observedAt) <= input.now.getTime() &&
        checkSignature(owner, input.policy) === "valid" &&
        owner.attestedEvidenceDigest === hash(manifest.evidenceDigests) &&
        input.manifest.evidenceDigests[owner.id] === evidenceDigest(owner) &&
        !owner.supportingFiles?.length,
      "owner_binding",
    );
    const transport = validateBundleTransport({
      ...proof.data,
      manifest,
      policy: input.policy,
      evidence: all
        .filter((item) => item.artifact.id !== approval.evidenceId)
        .map((item) => item.file),
      now: input.now,
    });
    requireBundle(
      Date.parse(owner.observedAt) >= transport.observedAt,
      "owner_precedes_verification",
    );
    for (const [name, bytes] of [
      ["bundleIndex", proof.data.index],
      ["bundleCapture", proof.data.capture],
      ["bundleVerification", proof.data.verification],
    ] as const)
      requireBundle(owner.digests[name] === sha256Digest(bytes), "owner_witness_binding");
    return { problems: [], expiresAt: transport.expiresAt };
  } catch (error) {
    return {
      problems: [`bundle_binding_invalid:${error instanceof BundleError ? error.code : "schema"}`],
    };
  }
}
