import "server-only";
import { type GateId, gatePolicySchema, readinessReportSchema } from "@/release/schemas";
import { canonicalJson, sha256Digest } from "@/release/signature";
import sourcePolicy from "../../../release/policy.json";
import { loadReadinessSnapshot, readReadiness } from "./readiness";

const policy = gatePolicySchema.parse(sourcePolicy);
export type RequirementResult = "confirmed" | "not_confirmed" | "rejected";
export interface ReleaseRequirement {
  type: string;
  result: RequirementResult;
  evidence: { id: string | null; digest: string; counted: boolean }[];
}
export async function runtimeReadinessInput() {
  return {
    buildSha: process.env.BUILD_SHA?.trim() || null,
    environment: process.env.RELEASE_ENVIRONMENT?.trim() || null,
    manifestDigest: process.env.RELEASE_MANIFEST_DIGEST?.trim() || null,
    policyDigest: process.env.RELEASE_POLICY_DIGEST?.trim() || null,
    snapshotDigest: process.env.RELEASE_SNAPSHOT_DIGEST?.trim() || null,
    snapshot: await loadReadinessSnapshot(),
  };
}

/** The existing authorized, release-bound read remains the only verdict authority. */
export async function readReleaseOverview(...args: Parameters<typeof readReadiness>) {
  const summary = await readReadiness(...args);
  const input = args[2];
  const parsed = readinessReportSchema.safeParse(input.snapshot);
  const report = summary.snapshotState === "current" && parsed.success ? parsed.data : null;
  // A different installed policy must not lend its requirements to a current report.
  const policyMatches =
    !report || report.policy.policyDigest === sha256Digest(canonicalJson(policy));
  return {
    summary,
    policyMatches,
    gates: summary.gates.map((gate) => {
      const definition = policy.gates.find((item) => item.id === gate.id);
      const affected = new Set<GateId>([gate.id]);
      for (let previous = -1; previous !== affected.size; ) {
        previous = affected.size;
        for (const item of policy.gates)
          if (item.dependsOn.some((id) => affected.has(id))) affected.add(item.id);
      }
      return {
        ...gate,
        affects: policyMatches ? [...affected].filter((id) => id !== gate.id) : [],
        requirements: (policyMatches ? (definition?.requiredEvidence ?? []) : []).map(
          (type): ReleaseRequirement => {
            const evidence = (report?.evidence ?? [])
              .filter((item) => item.type === type && item.gate === gate.id)
              .map(({ id, digest, counted }) => ({ id, digest, counted }));
            return {
              type,
              result: evidence.some((item) => item.counted)
                ? "confirmed"
                : evidence.length
                  ? "rejected"
                  : "not_confirmed",
              evidence,
            };
          },
        ),
      };
    }),
  };
}
export type ReleaseOverview = Awaited<ReturnType<typeof readReleaseOverview>>;
