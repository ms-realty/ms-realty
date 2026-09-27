// Explicit worker entry point. No network provider is chosen implicitly, and no test outbox
// can run on real hosts. Web, worker and migration processes share one application revision.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { getEnv } from "../src/server/config/env";
import { TestMessageProvider } from "../src/server/jobs/provider";
import { JobQueue, registerWorkers } from "../src/server/jobs/queue";
import { ResendMessageProvider } from "../src/server/jobs/resend";

const env = getEnv();
if (!env.databaseUrl) throw new Error("DATABASE_URL is required");
const provider = env.testOutbox
  ? new TestMessageProvider()
  : env.email.provider === "resend" && env.email.from && process.env.RESEND_API_KEY
    ? new ResendMessageProvider({
        apiKey: process.env.RESEND_API_KEY,
        from: env.email.from,
        hosts: env.hosts,
      })
    : null;
if (!provider)
  throw new Error(
    "Set EMAIL_PROVIDER=resend, EMAIL_FROM and RESEND_API_KEY, or enable the loopback-only test outbox",
  );
const client = postgres(env.databaseUrl, {
  max: 8,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 1800,
  onnotice: () => {},
});
const db = drizzle(client, { schema }),
  queue = new JobQueue(env.databaseUrl);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await queue.stop();
  } finally {
    await client.end({ timeout: 15 });
  }
}
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
try {
  await queue.start();
  await registerWorkers(queue, { db, provider });
  await queue.scheduleRecurring();
  await queue.send("worker.heartbeat", {});
  console.log("MS Realty queue worker started");
} catch {
  console.error("MS Realty queue worker failed; inspect redacted operational records");
  process.exitCode = 1;
  await stop();
}
