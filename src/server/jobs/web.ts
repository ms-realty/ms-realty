// The web process's handle on the job queue. It only enqueues; the worker process delivers.
// With the loopback-only test outbox (env.testOutbox) the web process also runs the workers
// against an in-memory provider, so e2e and local runs can read the email they caused.
import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "../config/env";
import { TestMessageProvider } from "./provider";
import { JobQueue, registerWorkers } from "./queue";

// Survives dev-server module reloads, like the database pool.
const cache = globalThis as {
  __msRealtyQueue?: Promise<JobQueue>;
  __msRealtyTestOutbox?: TestMessageProvider;
};

export function getJobQueue(): Promise<JobQueue> {
  cache.__msRealtyQueue ??= (async () => {
    const env = getEnv();
    if (!env.databaseUrl) throw new Error("DATABASE_URL is required.");
    const queue = new JobQueue(env.databaseUrl, { producer: !env.testOutbox });
    await queue.start();
    if (env.testOutbox) {
      await registerWorkers(queue, { db: getDb(), provider: testOutbox() });
    }
    return queue;
  })().catch((error: unknown) => {
    cache.__msRealtyQueue = undefined;
    throw error;
  });
  return cache.__msRealtyQueue;
}

/** Messages the in-process worker delivered; only meaningful when env.testOutbox is on. */
export function testOutbox(): TestMessageProvider {
  cache.__msRealtyTestOutbox ??= new TestMessageProvider();
  return cache.__msRealtyTestOutbox;
}
