// Operations readiness (architecture §19.3 "Operations", §20.3; D14; AT67): release identity and
// the R00–R12 gate summary for the running build, for authorized staff only. It reads the
// snapshot `npm run release:evaluate` wrote and never re-derives a verdict: a missing or invalid
// snapshot, or one evaluated for another release, reports every gate blocked.
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Actor } from "@/domain/capabilities";
import { gateIds, readinessReportSchema } from "@/release/schemas";
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

/** The gate summary of `snapshot` if it was evaluated for `buildSha`; otherwise all blocked. */
export function summarizeReadiness(snapshot: unknown, buildSha: string | null): ReadinessResponse {
  const release = { sha: buildSha };
  if (snapshot === null) return allBlocked(release, "missing");
  const parsed = readinessReportSchema.safeParse(snapshot);
  if (!parsed.success) return allBlocked(release, "invalid");
  const report = parsed.data;
  if (!buildSha || report.release.releaseSha !== buildSha) {
    return allBlocked(release, "other_release");
  }
  return {
    release,
    snapshotState: "current",
    snapshot: {
      snapshotId: report.snapshotId,
      evaluatedAt: report.evaluatedAt,
      releaseSha: report.release.releaseSha,
      environment: report.release.environment,
      policyRevision: report.policy.policyRevision,
    },
    verdict: report.verdict,
    gates: report.gates.map(({ id, status, blockers }) => ({ id, status, blockers })),
  };
}

/** Staff holding `report.read` only; clients and visitors are refused. */
export async function readReadiness(
  db: Executor,
  actor: Actor | null,
  input: { readonly buildSha: string | null; readonly snapshot: unknown },
): Promise<ReadinessResponse> {
  if (!actor) throw new AppError("unauthenticated");
  if (actor.kind !== "staff") throw new AppError("forbidden");
  await assertCan(db, actor, "report.read");
  return summarizeReadiness(input.snapshot, input.buildSha);
}
