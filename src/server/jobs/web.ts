// The web process's handle on the job queue. It only enqueues; the worker process delivers.
// With the loopback-only test outbox (env.testOutbox) the web process also runs the workers
// against an in-memory provider, so e2e and local runs can read the email they caused.
import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "../config/env";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { TestMessageProvider } from "./provider";
import { JobQueue, registerWorkers } from "./queue";

// Survives dev-server module reloads, like the database pool.
const cache = globalThis as {
  __appJobQueue?: Promise<JobQueue>;
  __appTestOutbox?: TestMessageProvider;
};

export function getJobQueue(): Promise<JobQueue> {
  cache.__appJobQueue ??= (async () => {
    const env = getEnv();
    if (!env.databaseUrl) throw new Error("DATABASE_URL is required.");
    await assertRecoveryOpen(getDb());
    const queue = new JobQueue(env.databaseUrl, { producer: !env.testOutbox });
    await queue.start();
    if (env.testOutbox) {
      await registerWorkers(queue, { db: getDb(), provider: testOutbox() });
    }
    return queue;
  })().catch((error: unknown) => {
    cache.__appJobQueue = undefined;
    throw error;
  });
  return cache.__appJobQueue;
}

/** Messages the in-process worker delivered; only meaningful when env.testOutbox is on. */
export function testOutbox(): TestMessageProvider {
  cache.__appTestOutbox ??= new TestMessageProvider();
  return cache.__appTestOutbox;
}

/**
 * Asks the worker to send queued deal notices now. Best effort by design: the notices are
 * already committed on the ledger, and the worker's minute sweep sends them if this hint is lost.
 */
export async function kickDealNotices(): Promise<void> {
  try {
    const queue = await getJobQueue();
    await queue.send("deal_notices.dispatch", {}, { singletonKey: "deal-notices" });
  } catch {
    /* The outbox sweep is the backstop. */
  }
}
