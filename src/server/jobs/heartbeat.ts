import "server-only";
import { workerProgress } from "@/db/schema";
import type { Executor } from "../db";

/** Called by an actual scheduled queue job, after database work succeeds. */
export async function recordWorkerProgress(
  db: Executor,
  source: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const values = {
    key: "queue-worker",
    buildSha: source.BUILD_SHA || "dev",
    completedAt: new Date(),
  };
  await db
    .insert(workerProgress)
    .values(values)
    .onConflictDoUpdate({ target: workerProgress.key, set: values });
  if (!source.WORKER_HEARTBEAT_URL) return;
  const url = new URL(source.WORKER_HEARTBEAT_URL);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "uptime.betterstack.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/v1\/heartbeat\/[a-zA-Z0-9_-]+$/.test(url.pathname)
  )
    throw new Error("Invalid worker heartbeat configuration");
  const response = await fetcher(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Independent worker heartbeat was not acknowledged");
}
