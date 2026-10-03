// Release gate evaluation (architecture §20.3, §21.2, §21.3; D14; AT67). One manifest, one
// policy and a directory of evidence produce one readiness snapshot; the JSON and the markdown
// view are both rendered from it. Everything fails closed: missing, stale, wrong-release,
// wrong-policy, unsigned-where-required or unreadable evidence does not count, and a gate
// passes only when every requirement is met by evidence that counts.
import type { z } from "zod";
import {
  type EvidenceArtifact,
  evidenceArtifactSchema,
  type GatePolicy,
  gatePolicySchema,
  manifestApprovalRoles,
  type ReadinessReport,
  type ReleaseManifest,
  releaseManifestSchema,
} from "./schemas";
import { canonicalJson, checkSignature, sha256Digest } from "./signature";

/** Allowed clock skew for an observation time ahead of the evaluator. */
const futureSkewMs = 5 * 60_000;

export class ReleaseInputError extends Error {}

export interface EvidenceFile {
  /** Path relative to the evidence directory, as reported. */
  readonly file: string;
  readonly content: string;
}

export interface EvaluationInput {
  readonly manifest: unknown;
  readonly policy: unknown;
  readonly evidence: readonly EvidenceFile[];
  readonly now: Date;
}

function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ReleaseInputError(`Invalid ${what}: ${issues}`);
  }
  return result.data;
}

/** Unknown manifest fields (null or empty scope lists) and missing named approvals. */
export function manifestGaps(manifest: ReleaseManifest): string[] {
  const gaps: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (value === null) gaps.push(path);
    else if (Array.isArray(value)) {
      if (value.length === 0 && path.startsWith("/scope/")) gaps.push(path);
    } else if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) walk(item, `${path}/${key}`);
    }
  };
  walk(manifest, "");
  for (const role of manifestApprovalRoles) {
    if (!manifest.approvals.some((approval) => approval.role === role)) {
      gaps.push(`/approvals/${role}`);
    }
  }
  const names = (role: string) =>
    manifest.approvals.filter((a) => a.role === role).map((a) => a.name.toLowerCase());
  if (names("reviewer").some((reviewer) => names("operator").includes(reviewer))) {
    gaps.push("/approvals/reviewer_not_separate");
  }
  return gaps;
}

interface Assessed {
  readonly file: string;
  readonly digest: string;
  readonly artifact: EvidenceArtifact | null;
  readonly reasons: string[];
}

function assessArtifact(
  artifact: EvidenceArtifact,
  manifest: ReleaseManifest,
  policy: GatePolicy,
  now: Date,
): string[] {
  const reasons: string[] = [];
  const type = policy.evidenceTypes.find((candidate) => candidate.id === artifact.type);
  if (!type) return ["unknown_type"];
  if (!manifest.evidenceIds.includes(artifact.id)) reasons.push("not_in_manifest");
  if (artifact.releaseSha !== manifest.releaseSha) reasons.push("wrong_release");
  if (artifact.policyRevision !== policy.policyRevision) reasons.push("wrong_policy");
  const environments = type.environments.map((env) =>
    env === "release" ? manifest.environment : env,
  );
  if (!environments.includes(artifact.environment)) reasons.push("wrong_environment");
  if (type.bindsArtifacts) {
    for (const [name, expected] of Object.entries(manifest.artifacts)) {
      if (expected === null) reasons.push(`artifact_unknown:${name}`);
      else if (artifact.digests[name] !== expected) reasons.push(`artifact_mismatch:${name}`);
    }
  }
  const observed = Date.parse(artifact.observedAt);
  if (observed > now.getTime() + futureSkewMs) reasons.push("observed_in_future");
  if (type.maxAgeMinutes !== null && now.getTime() - observed > type.maxAgeMinutes * 60_000) {
    reasons.push("stale");
  }
  if (type.reviewerRequired && !artifact.reviewer) reasons.push("reviewer_missing");
  if (type.signatureRequired || artifact.signature) {
    const signature = checkSignature(artifact, policy);
    if (signature !== "valid") reasons.push(signature);
  }
  if (artifact.assertions.some((assertion) => !assertion.passed)) reasons.push("assertion_failed");
  return reasons;
}

function assessEvidence(
  files: readonly EvidenceFile[],
  manifest: ReleaseManifest,
  policy: GatePolicy,
  now: Date,
): Assessed[] {
  const assessed = [...files]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((file): Assessed => {
      const digest = sha256Digest(file.content);
      let json: unknown;
      try {
        json = JSON.parse(file.content);
      } catch {
        return { file: file.file, digest, artifact: null, reasons: ["invalid_json"] };
      }
      const result = evidenceArtifactSchema.safeParse(json);
      if (!result.success) {
        return { file: file.file, digest, artifact: null, reasons: ["invalid_schema"] };
      }
      const artifact = result.data;
      return {
        file: file.file,
        digest,
        artifact,
        reasons: assessArtifact(artifact, manifest, policy, now),
      };
    });
  // Two artifacts with one id make the binding ambiguous: neither counts.
  const counts = new Map<string, number>();
  for (const item of assessed) {
    if (item.artifact) counts.set(item.artifact.id, (counts.get(item.artifact.id) ?? 0) + 1);
  }
  for (const item of assessed) {
    if (item.artifact && (counts.get(item.artifact.id) ?? 0) > 1) item.reasons.push("duplicate_id");
  }
  return assessed;
}

export function evaluateRelease(input: EvaluationInput): ReadinessReport {
  const policy = parse(gatePolicySchema, input.policy, "gate policy");
  const manifest = parse(releaseManifestSchema, input.manifest, "release manifest");
  const now = input.now;
  const evaluatedAt = now.toISOString();
  const manifestDigest = sha256Digest(canonicalJson(manifest));
  const policyDigest = sha256Digest(canonicalJson(policy));
  const gaps = manifestGaps(manifest);
  const evidence = assessEvidence(input.evidence, manifest, policy, now);
  const counted = evidence.flatMap((item) =>
    item.artifact && item.reasons.length === 0 ? [item.artifact] : [],
  );
  /** A replacement or retirement approval names a counted artifact of the mapping gate. */
  const mappingGate = policy.gates.find((gate) => gate.requiresLegacyMapping)?.id;
  const legacyApproved = (evidenceId: string | undefined) =>
    counted.some((artifact) => artifact.id === evidenceId && artifact.gate === mappingGate);

  const statuses = new Map<string, "pass" | "blocked">();
  const gates = policy.gates.map((gate) => {
    const blockers: string[] = [];
    const own = counted.filter((artifact) => artifact.gate === gate.id);
    if (manifest.policies.policyRevision !== policy.policyRevision) {
      blockers.push("policy_revision_mismatch");
    }
    for (const dependency of gate.dependsOn) {
      if (statuses.get(dependency) !== "pass") blockers.push(`dependency_blocked:${dependency}`);
    }
    for (const type of gate.requiredEvidence) {
      if (!own.some((artifact) => artifact.type === type))
        blockers.push(`missing_evidence:${type}`);
    }
    for (const id of gate.requiredAssertions) {
      const proven = own.some((artifact) =>
        artifact.assertions.some((assertion) => assertion.id === id && assertion.passed),
      );
      if (!proven) blockers.push(`missing_assertion:${id}`);
    }
    if (gate.requiresCompleteManifest && gaps.length > 0) blockers.push("manifest_incomplete");
    if (gate.requiresLegacyMapping) {
      for (const legacy of policy.legacyGates) {
        if (legacy.disposition === "retained_obligation") continue;
        if (!legacyApproved(legacy.approval?.evidenceId)) {
          blockers.push(`legacy_mapping_unapproved:${legacy.id}`);
        }
      }
    }
    const status = blockers.length === 0 ? "pass" : "blocked";
    statuses.set(gate.id, status);
    return {
      id: gate.id,
      title: gate.title,
      stage: gate.stage,
      status,
      blockers,
      evidenceIds: own.map((artifact) => artifact.id).sort(),
    } as const;
  });

  const snapshotId = sha256Digest(
    canonicalJson({
      manifestDigest,
      policyDigest,
      evidence: evidence.map((item) => ({ file: item.file, digest: item.digest })),
      evaluatedAt,
    }),
  );

  return {
    schemaVersion: 1,
    snapshotId,
    evaluatedAt,
    release: {
      releaseSha: manifest.releaseSha,
      environment: manifest.environment,
      specVersion: manifest.specVersion,
      manifestDigest,
      gaps,
    },
    policy: { policyRevision: policy.policyRevision, policyDigest },
    verdict: gates.every((gate) => gate.status === "pass") ? "pass" : "blocked",
    gates,
    evidence: evidence.map((item) => ({
      file: item.file,
      id: item.artifact?.id ?? null,
      type: item.artifact?.type ?? null,
      gate: item.artifact?.gate ?? null,
      digest: item.digest,
      counted: item.artifact !== null && item.reasons.length === 0,
      reasons: item.reasons,
    })),
    legacyGates: policy.legacyGates.map((legacy) => ({
      id: legacy.id,
      disposition: legacy.disposition,
      gates: legacy.gates,
      approved:
        legacy.disposition === "retained_obligation" || legacyApproved(legacy.approval?.evidenceId),
    })),
  };
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

/** The human-readable checklist, rendered from the same snapshot as the JSON. */
export function renderReadinessMarkdown(report: ReadinessReport): string {
  const lines = [
    "# Release readiness",
    "",
    "Generated by `npm run release:evaluate`. Do not edit: regenerate from the manifest, policy",
    "and evidence instead.",
    "",
    `- Snapshot: \`${report.snapshotId}\``,
    `- Evaluated at: ${report.evaluatedAt}`,
    `- Release: \`${report.release.releaseSha}\` (${report.release.environment}, ${report.release.specVersion})`,
    `- Manifest: \`${report.release.manifestDigest}\``,
    `- Policy: ${report.policy.policyRevision} (\`${report.policy.policyDigest}\`)`,
    `- Verdict: **${report.verdict}**`,
    "",
    "## Gates",
    "",
    "| Gate | Title | Status | Blockers | Evidence |",
    "|---|---|---|---|---|",
    ...report.gates.map(
      (gate) =>
        `| ${gate.id} | ${cell(gate.title)} | **${gate.status}** | ${
          gate.blockers.map((b) => `\`${b}\``).join(", ") || "none"
        } | ${gate.evidenceIds.map((id) => `\`${id}\``).join(", ") || "none"} |`,
    ),
    "",
    "## Manifest gaps",
    "",
    ...(report.release.gaps.length ? report.release.gaps.map((gap) => `- \`${gap}\``) : ["None."]),
    "",
    "## Evidence",
    "",
    ...(report.evidence.length
      ? [
          "| File | Id | Type | Gate | Counted | Reasons |",
          "|---|---|---|---|---|---|",
          ...report.evidence.map(
            (item) =>
              `| ${cell(item.file)} | ${cell(item.id ?? "?")} | ${cell(item.type ?? "?")} | ${
                item.gate ?? "?"
              } | ${item.counted ? "yes" : "no"} | ${item.reasons.join(", ") || "none"} |`,
          ),
        ]
      : ["No evidence supplied."]),
    "",
    "## Legacy gate mapping (§21.2)",
    "",
    "| Legacy gate | Disposition | Gates | Approved |",
    "|---|---|---|---|",
    ...report.legacyGates.map(
      (legacy) =>
        `| ${legacy.id} | ${legacy.disposition} | ${legacy.gates.join(", ")} | ${
          legacy.approved ? "yes" : "no"
        } |`,
    ),
    "",
  ];
  return lines.join("\n");
}
