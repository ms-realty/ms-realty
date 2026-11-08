// Local capture and separately invoked verification. Transport is never execution authority.
import type { KeyObject } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  type BundleBinding,
  type BundleEntry,
  type BundleEvidence,
  bundleBindingSchema,
  bundleLimits,
  bundleWitness,
  parseBundleIndex,
  parseBundleJson,
  requireBundle,
  validateBundleIndex,
  validateBundleTransport,
} from "./bundle";
import {
  assertSeparateBundleTrees,
  bundleRoot,
  createBundleOutput,
  inventoryBundleTree,
  readBundleFile,
  writeBundleFile,
} from "./bundle-files";
import { evaluateRelease, renderReadinessMarkdown } from "./evaluate";
import {
  type AdmittedReleaseTrust,
  evidenceArtifactSchema,
  type GatePolicy,
  gatePolicySchema,
  type ReadinessReport,
  type ReleaseManifest,
  readinessReportSchema,
  releaseManifestSchema,
} from "./schemas";
import {
  canonicalJson,
  checkSignature,
  evidenceDigest,
  releaseContextDigest,
  sha256Digest,
  signEvidence,
} from "./signature";

export const bundleSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    files: z
      .array(
        z.discriminatedUnion("role", [
          z.object({ path: z.string(), role: z.enum(["manifest", "policy", "evidence"]) }).strict(),
          z
            .object({
              path: z.string(),
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
type Source = z.infer<typeof bundleSourceSchema>;
export type BundleSigner = { keyId: string; privateKey: KeyObject };
type Signing = () => BundleSigner;
type Candidate = { policy: GatePolicy; manifest: ReleaseManifest; evidence: BundleEvidence[] };
const hash = (value: unknown) => sha256Digest(canonicalJson(value));
const preReviewGaps = new Set([
  "/approvals/single_owner_required",
  "/approvals/wrong_owner",
  "/approvals/candidate_review_required",
]);
const preReviewBlockers = new Set([
  "missing_evidence:release_attestation",
  "manifest_incomplete",
  "bundle_binding_missing",
]);
const resultSchema = z
  .object({
    schemaVersion: z.literal(1),
    format: z.literal("ms-realty-evidence-bundle-result"),
    operation: z.enum(["capture", "verify", "candidate"]),
    outcome: z.enum(["verified", "blocked"]),
    prerequisites: z.enum(["pass", "blocked"]),
    r00ToR10: z.enum(["pass", "blocked"]),
    overallRelease: z.literal("blocked"),
    approval: z.enum(["missing", "verified"]),
    execution: z.literal("unavailable"),
    snapshotId: z.string(),
    evidenceIds: z.array(z.string()),
    reasons: z.array(z.string()),
  })
  .strict();
type Result = z.infer<typeof resultSchema>;

function decode<S extends z.ZodType>(schema: S, bytes: Uint8Array | string): z.output<S> {
  const parsed = schema.safeParse(parseBundleJson(bytes));
  requireBundle(parsed.success, "input_schema");
  return parsed.data;
}
function textFile(root: string, path: string) {
  const bytes = readBundleFile(root, path, bundleLimits.jsonBytes);
  parseBundleJson(bytes); // Reject invalid UTF-8 and duplicate members before semantic parsing.
  return bytes.toString("utf8");
}
function inputCandidate(root: string, source: Source): Candidate {
  const select = (role: "manifest" | "policy") => {
    const files = source.files.filter((item) => item.role === role);
    requireBundle(files.length === 1 && files[0], "control_inventory");
    return textFile(root, files[0].path);
  };
  const policy = decode(gatePolicySchema, select("policy"));
  const manifest = decode(releaseManifestSchema, select("manifest"));
  const evidence = source.files
    .filter((item) => item.role === "evidence")
    .map((item) => ({ file: item.path, content: textFile(root, item.path) }));
  for (const file of evidence) decode(evidenceArtifactSchema, file.content);
  return { policy, manifest, evidence };
}

/** Only the absent current A is deferred. R10 nonapproval proof and every supplied E0 must count. */
export function bundlePrerequisites(
  candidate: Candidate,
  trust: AdmittedReleaseTrust | undefined,
  now: Date,
) {
  const report = evaluateRelease({ ...candidate, admittedTrust: trust, now });
  const reasons: string[] = [];
  if (candidate.policy.approvalModel?.mode !== "single_operator_owner_review")
    reasons.push("single_operator_mode_required");
  if (candidate.manifest.approvals.length) reasons.push("base_approval_not_empty");
  if (!trust || candidate.policy.trustedKeys.length === 0) reasons.push("admission_required");
  for (const gap of report.release.gaps)
    if (!preReviewGaps.has(gap)) reasons.push(`manifest:${gap}`);
  for (const item of report.evidence) if (!item.counted) reasons.push("uncounted_evidence");
  for (const gate of report.gates.slice(0, 10))
    if (gate.status !== "pass") reasons.push(`prior_gate:${gate.id}`);
  for (const blocker of report.gates.find((gate) => gate.id === "R10")?.blockers ?? [])
    if (!preReviewBlockers.has(blocker)) reasons.push(`R10:${blocker}`);
  if (report.evidence.some((item) => item.gate === "R11" || item.gate === "R12"))
    reasons.push("base_evidence_scope");
  return { report, reasons: [...new Set(reasons)] };
}

function result(
  operation: Result["operation"],
  report: ReadinessReport,
  reasons: string[],
  final = false,
): Result {
  return {
    schemaVersion: 1,
    format: "ms-realty-evidence-bundle-result",
    operation,
    outcome: reasons.length ? "blocked" : "verified",
    prerequisites: reasons.length ? "blocked" : "pass",
    r00ToR10: final && reasons.length === 0 ? "pass" : "blocked",
    overallRelease: "blocked",
    approval: final && reasons.length === 0 ? "verified" : "missing",
    execution: "unavailable",
    snapshotId: report.snapshotId,
    evidenceIds: report.evidence.map((item) => item.id).filter((id): id is string => id !== null),
    reasons,
  };
}
function views(root: string, report: ReadinessReport, output: Result) {
  writeBundleFile(root, "readiness.json", canonicalJson(report));
  writeBundleFile(root, "readiness.md", bundleReadinessMarkdown(report, output));
}
function bundleReadinessMarkdown(report: ReadinessReport, output: Result) {
  return [
    `Bundle operation: ${output.operation}; result: ${output.outcome}.`,
    `R00–R10: ${output.r00ToR10}; overall release: blocked; execution: unavailable.`,
    `Candidate approval: ${output.approval}. Machine verification does not supply human review.`,
    "",
    renderReadinessMarkdown(report),
  ].join("\n");
}
function validatePriorViews(
  root: string,
  prior: Result,
  candidate: Candidate,
  trust: AdmittedReleaseTrust | undefined,
  now: Date,
) {
  const original = readinessReportSchema.parse(
    parseBundleJson(textFile(root, "readiness.json"), true),
  );
  requireBundle(
    Date.parse(original.evaluatedAt) <= now.getTime() &&
      now.getTime() < Date.parse(original.expiresAt),
    "original_snapshot_freshness",
  );
  const recomputed = evaluateRelease({
    ...candidate,
    admittedTrust: trust,
    now: new Date(original.evaluatedAt),
  });
  requireBundle(
    canonicalJson(original) === canonicalJson(recomputed) &&
      canonicalJson(prior) === canonicalJson(result(prior.operation, original, [])),
    "original_snapshot_mismatch",
  );
  requireBundle(
    readBundleFile(root, "readiness.md", bundleLimits.jsonBytes).equals(
      Buffer.from(bundleReadinessMarkdown(original, prior)),
    ),
    "readiness_views_mismatch",
  );
}
function signWitness(
  candidate: Candidate,
  index: string,
  now: Date,
  signing: Signing,
  capture?: string,
): string {
  const signer = signing();
  const key = candidate.policy.trustedKeys.find((item) => item.keyId === signer.keyId);
  requireBundle(
    key?.actorKind === "machine" && key.purposes?.includes("machine_observation"),
    "machine_signer_required",
  );
  const witness = signEvidence(
    bundleWitness({
      index,
      ...candidate,
      evidence: candidate.evidence.map((file) => decode(evidenceArtifactSchema, file.content)),
      at: now,
      actor: { kind: "machine", name: key.owner, version: "1" },
      ...(capture === undefined ? {} : { capture }),
    }),
    signer.privateKey,
    signer.keyId,
  );
  requireBundle(checkSignature(witness, candidate.policy) === "valid", "signer_scope_or_key");
  return canonicalJson(witness);
}

function copyFile(source: string, path: string, out: string, maximum: number) {
  const bytes = readBundleFile(source, path, maximum);
  requireBundle(
    !/-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----/.test(bytes.toString("utf8")),
    "private_material_in_payload",
  );
  writeBundleFile(out, path, bytes);
  const copied = readBundleFile(out, path, maximum);
  requireBundle(copied.equals(bytes), "copied_bytes_changed");
  return bytes;
}
function verifyPayload(root: string, indexBytes: string) {
  const index = parseBundleIndex(indexBytes);
  const payload = bundleRoot(join(root, "payload"));
  const actual = inventoryBundleTree(payload);
  requireBundle(
    canonicalJson([...actual.keys()].sort()) ===
      canonicalJson(index.entries.map((item) => item.path)),
    "closed_payload_inventory",
  );
  for (const entry of index.entries) {
    const bytes = readBundleFile(
      payload,
      entry.path,
      entry.role === "supporting" ? bundleLimits.fileBytes : bundleLimits.jsonBytes,
    );
    requireBundle(
      bytes.length === entry.bytes && sha256Digest(bytes) === entry.digest,
      "payload_byte_mismatch",
    );
    if (entry.role !== "supporting") parseBundleJson(bytes);
  }
  const source = bundleSourceSchema.parse({
    schemaVersion: 1,
    files: index.entries.map((entry) =>
      entry.role === "supporting"
        ? { path: entry.path, role: entry.role, references: entry.references }
        : { path: entry.path, role: entry.role },
    ),
  });
  const candidate = inputCandidate(payload, source);
  validateBundleIndex(index, candidate.manifest, candidate.policy, candidate.evidence);
  return candidate;
}

function expectedPackageFiles(
  index: ReturnType<typeof parseBundleIndex>,
  operation: Result["operation"],
) {
  return [
    "index.json",
    "capture.json",
    "readiness.json",
    "readiness.md",
    "result.json",
    ...(operation === "capture" ? [] : ["verification.json"]),
    ...(operation === "candidate"
      ? ["candidate.json", "manifest.final.json", "owner-review.json"]
      : []),
    ...index.entries.map((entry) => `payload/${entry.path}`),
  ].sort();
}
function checkPackageInventory(
  root: string,
  index: ReturnType<typeof parseBundleIndex>,
  operation: Result["operation"],
  publishing = false,
) {
  const actual = inventoryBundleTree(root, bundleLimits.entries + 12, 1);
  const expected = expectedPackageFiles(index, operation).filter(
    (path) => !publishing || path !== "result.json",
  );
  requireBundle(
    canonicalJson([...actual.keys()].sort()) === canonicalJson(expected),
    "closed_package_inventory",
  );
}

export function captureEvidenceBundle(input: {
  root: string;
  source: unknown;
  out: string;
  trust?: AdmittedReleaseTrust;
  signing: Signing;
  now: Date;
}) {
  // Freeze caller-owned configuration before doing any work. Operations are synchronous.
  const source = decode(bundleSourceSchema, canonicalJson(structuredClone(input.source)));
  const root = bundleRoot(input.root);
  const inventory = inventoryBundleTree(root);
  requireBundle(
    canonicalJson([...inventory.keys()].sort()) ===
      canonicalJson(source.files.map((item) => item.path).sort()),
    "closed_input_inventory",
  );
  const candidate = inputCandidate(root, source);
  const prerequisites = bundlePrerequisites(candidate, input.trust, input.now);
  const output = createBundleOutput(input.out, [root]);
  try {
    const receipt = result("capture", prerequisites.report, prerequisites.reasons);
    if (prerequisites.reasons.length) {
      views(output.root, prerequisites.report, receipt);
      writeBundleFile(output.root, "result.json", canonicalJson(receipt));
      return receipt;
    }
    // Nothing is signed until prerequisites pass and every actual payload file is copied.
    const payload = join(output.root, "payload");
    mkdirSync(payload, { mode: 0o700 });
    const entries: BundleEntry[] = [];
    let remaining = bundleLimits.payloadBytes;
    for (const item of source.files) {
      const bytes = copyFile(
        root,
        item.path,
        payload,
        Math.min(
          remaining,
          item.role === "supporting" ? bundleLimits.fileBytes : bundleLimits.jsonBytes,
        ),
      );
      remaining -= bytes.length;
      const common = {
        path: item.path,
        role: item.role,
        bytes: bytes.length,
        digest: sha256Digest(bytes),
      };
      if (item.role === "evidence") {
        const artifact = decode(evidenceArtifactSchema, bytes);
        entries.push({
          ...common,
          role: "evidence",
          evidenceId: artifact.id,
          artifactDigest: evidenceDigest(artifact),
        });
      } else if (item.role === "supporting")
        entries.push({ ...common, role: "supporting", references: item.references });
      else entries.push({ ...common, role: item.role });
    }
    const index = canonicalJson({
      schemaVersion: 1,
      format: "ms-realty-evidence-bundle",
      releaseSha: candidate.manifest.releaseSha,
      environment: candidate.manifest.environment,
      policyDigest: hash(candidate.policy),
      trustedKeysDigest: hash(candidate.policy.trustedKeys),
      contextDigest: releaseContextDigest(candidate.manifest),
      baseManifestDigest: hash(candidate.manifest),
      evidenceSetDigest: hash(candidate.manifest.evidenceDigests),
      entries: entries.sort((a, b) => (a.path < b.path ? -1 : 1)),
    });
    const copied = verifyPayload(output.root, index);
    const copiedPrerequisites = bundlePrerequisites(copied, input.trust, input.now);
    requireBundle(copiedPrerequisites.reasons.length === 0, "copied_prerequisites_blocked");
    const capture = signWitness(copied, index, input.now, input.signing);
    validateBundleTransport({ ...copied, index, capture, now: input.now });
    writeBundleFile(output.root, "index.json", index);
    writeBundleFile(output.root, "capture.json", capture);
    const copiedReceipt = result("capture", copiedPrerequisites.report, []);
    views(output.root, copiedPrerequisites.report, copiedReceipt);
    checkPackageInventory(output.root, parseBundleIndex(index), "capture", true);
    verifyPayload(output.root, index);
    writeBundleFile(output.root, "result.json", canonicalJson(copiedReceipt));
    return copiedReceipt;
  } catch (error) {
    output.cleanup();
    throw error;
  }
}

export function verifyEvidenceBundle(input: {
  root: string;
  out: string;
  trust?: AdmittedReleaseTrust;
  signing: Signing;
  now: Date;
  approval?: string;
}) {
  const root = bundleRoot(input.root);
  const prior = resultSchema.parse(parseBundleJson(textFile(root, "result.json"), true));
  requireBundle(
    prior.outcome === "verified" && prior.operation !== "candidate",
    "input_package_stage",
  );
  const index = textFile(root, "index.json");
  const parsed = parseBundleIndex(index);
  checkPackageInventory(root, parsed, prior.operation);
  const capture = textFile(root, "capture.json");
  const candidate = verifyPayload(root, index);
  const prerequisites = bundlePrerequisites(candidate, input.trust, input.now);
  const output = createBundleOutput(input.out, [root]);
  try {
    let receipt = result(
      input.approval === undefined ? "verify" : "candidate",
      prerequisites.report,
      prerequisites.reasons,
    );
    if (prerequisites.reasons.length) {
      views(output.root, prerequisites.report, receipt);
      writeBundleFile(output.root, "result.json", canonicalJson(receipt));
      return receipt;
    }
    validatePriorViews(root, prior, candidate, input.trust, input.now);
    const previousVerification =
      prior.operation === "verify" ? textFile(root, "verification.json") : undefined;
    validateBundleTransport({
      ...candidate,
      index,
      capture,
      ...(previousVerification === undefined ? {} : { verification: previousVerification }),
      now: input.now,
    });
    requireBundle(
      input.approval === undefined || previousVerification !== undefined,
      "verification_before_owner_review_required",
    );
    mkdirSync(join(output.root, "payload"), { mode: 0o700 });
    for (const entry of parsed.entries)
      copyFile(join(root, "payload"), entry.path, join(output.root, "payload"), entry.bytes);
    verifyPayload(output.root, index);
    const verification =
      input.approval === undefined
        ? signWitness(candidate, index, input.now, input.signing, capture)
        : previousVerification;
    requireBundle(verification, "verification_missing");
    const bundle: BundleBinding = bundleBindingSchema.parse({ index, capture, verification });
    validateBundleTransport({ ...candidate, ...bundle, now: input.now });
    let report = prerequisites.report;
    if (input.approval !== undefined) {
      const owner = decode(evidenceArtifactSchema, input.approval);
      requireBundle(
        owner.type === "release_attestation" &&
          owner.actor?.kind === "human" &&
          owner.actor.name === "Ivan" &&
          owner.purpose === "candidate_review" &&
          !candidate.manifest.evidenceIds.includes(owner.id) &&
          !parsed.entries.some((entry) => entry.path.toLowerCase() === "owner-review.json"),
        "owner_review_required",
      );
      const manifest: ReleaseManifest = {
        ...candidate.manifest,
        evidenceIds: [...candidate.manifest.evidenceIds, owner.id],
        evidenceDigests: {
          ...candidate.manifest.evidenceDigests,
          [owner.id]: evidenceDigest(owner),
        },
        approvals: [
          {
            role: "owner_self_review",
            name: "Ivan",
            purpose: "candidate_review",
            approvedAt: owner.observedAt,
            scope: "release",
            evidenceId: owner.id,
          },
        ],
      };
      const evidence = [
        ...candidate.evidence,
        { file: "owner-review.json", content: input.approval },
      ];
      report = evaluateRelease({
        manifest,
        policy: candidate.policy,
        evidence,
        bundle,
        admittedTrust: input.trust,
        now: input.now,
      });
      requireBundle(
        report.release.gaps.length === 0 &&
          report.evidence.every((item) => item.counted) &&
          report.gates.slice(0, 11).every((gate) => gate.status === "pass") &&
          report.verdict === "blocked",
        "candidate_not_qualified",
      );
      const final = { policy: candidate.policy, manifest, evidence, bundle, snapshot: report };
      // The later execution adapter still checks its whole packet, including configuration.
      requireBundle(
        Buffer.byteLength(canonicalJson(final)) <= bundleLimits.jsonBytes,
        "candidate_packet_size",
      );
      writeBundleFile(output.root, "candidate.json", canonicalJson(final));
      writeBundleFile(output.root, "manifest.final.json", canonicalJson(manifest));
      writeBundleFile(output.root, "owner-review.json", input.approval);
      receipt = result("candidate", report, [], true);
    }
    writeBundleFile(output.root, "index.json", index);
    writeBundleFile(output.root, "capture.json", capture);
    writeBundleFile(output.root, "verification.json", verification);
    views(output.root, report, receipt);
    checkPackageInventory(output.root, parsed, receipt.operation, true);
    verifyPayload(output.root, index);
    writeBundleFile(output.root, "result.json", canonicalJson(receipt));
    return receipt;
  } catch (error) {
    output.cleanup();
    throw error;
  }
}

export function requireExternalBundleFile(path: string, roots: readonly string[]) {
  for (const root of roots) assertSeparateBundleTrees(root, path);
}
