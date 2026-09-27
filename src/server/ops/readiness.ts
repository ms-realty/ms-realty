// Operations readiness (architecture §19.3 "Operations", §20.3; D14; AT67): release identity and
// the R00–R12 gate summary for the running build, for authorized staff only. It reads the
// snapshot `npm run release:evaluate` wrote and never re-derives a verdict: a missing or invalid
// snapshot, or one evaluated for another release, reports every gate blocked.
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Actor } from "@/domain/capabilities";
import { gateIds, readinessReportSchema } from "@/release/schemas";
import { readinessSnapshotDigest } from "@/release/signature";
import { assertCan } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { ReadinessResponse } from "../transport/registry";

export const readinessSnapshotPath = join(process.cwd(), "release", "readiness.json");

/** The snapshot file's parsed JSON; null when there is none. Unreadable JSON is `invalid`. */
export async function loadReadinessSnapshot(path = readinessSnapshotPath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { invalid: true };
  }
}

function allBlocked(
  release: ReadinessResponse["release"],
  snapshotState: Exclude<ReadinessResponse["snapshotState"], "current">,
): ReadinessResponse {
  const blocker = snapshotState === "missing" ? "no_snapshot" : `snapshot_${snapshotState}`;
  return {
    release,
    snapshotState,
    snapshot: null,
    verdict: "blocked",
    gates: gateIds.map((id) => ({ id, status: "blocked", blockers: [blocker] })),
  };
}

export interface RuntimeReleaseBinding {
  readonly environment: string | null;
  readonly manifestDigest: string | null;
  readonly policyDigest: string | null;
  readonly snapshotDigest: string | null;
  readonly now?: Date;
}

/** Saved verdicts must match the deployed identity and remain unmodified and unexpired. */
export function summarizeReadiness(
  snapshot: unknown,
  buildSha: string | null,
  binding: RuntimeReleaseBinding,
): ReadinessResponse {
  const release = { sha: buildSha };
  if (snapshot === null) return allBlocked(release, "missing");
  const parsed = readinessReportSchema.safeParse(snapshot);
  if (!parsed.success) return allBlocked(release, "invalid");
  const report = parsed.data;
  if (readinessSnapshotDigest(report) !== report.snapshotId) return allBlocked(release, "invalid");
  if (!buildSha || report.release.releaseSha !== buildSha) {
    return allBlocked(release, "other_release");
  }
  if (
    !binding.environment ||
    !binding.manifestDigest ||
    !binding.policyDigest ||
    !binding.snapshotDigest
  )
    return allBlocked(release, "unbound");
  if (report.snapshotId !== binding.snapshotDigest) return allBlocked(release, "other_snapshot");
  if (report.release.environment !== binding.environment)
    return allBlocked(release, "other_environment");
  if (report.release.manifestDigest !== binding.manifestDigest)
    return allBlocked(release, "other_manifest");
  if (report.policy.policyDigest !== binding.policyDigest)
    return allBlocked(release, "other_policy");
  const now = (binding.now ?? new Date()).getTime();
  if (!Number.isFinite(now) || Date.parse(report.evaluatedAt) > now + 5 * 60_000)
    return allBlocked(release, "invalid");
  if (Date.parse(report.expiresAt) <= now) return allBlocked(release, "expired");
  return {
    release,
    snapshotState: "current",
    snapshot: {
      snapshotId: report.snapshotId,
      evaluatedAt: report.evaluatedAt,
      expiresAt: report.expiresAt,
      releaseSha: report.release.releaseSha,
      environment: report.release.environment,
      policyRevision: report.policy.policyRevision,
      manifestDigest: report.release.manifestDigest,
      policyDigest: report.policy.policyDigest,
    },
    verdict: report.verdict,
    gates: report.gates.map(({ id, status, blockers }) => ({ id, status, blockers })),
  };
}

/** Staff holding `report.read` only; clients and visitors are refused. */
export async function readReadiness(
  db: Executor,
  actor: Actor | null,
  input: RuntimeReleaseBinding & { readonly buildSha: string | null; readonly snapshot: unknown },
): Promise<ReadinessResponse> {
  if (!actor) throw new AppError("unauthenticated");
  if (actor.kind !== "staff") throw new AppError("forbidden");
  await assertCan(db, actor, "report.read");
  return summarizeReadiness(input.snapshot, input.buildSha, input);
}
