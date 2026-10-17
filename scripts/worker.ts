// Explicit worker entry point. No network provider is chosen implicitly, and no test outbox
// can run on real hosts. Web, worker and migration processes share one application revision.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { databaseTransport } from "../src/db/transport";
import { getEnv } from "../src/server/config/env";
import { CloudflareMessageProvider } from "../src/server/jobs/cloudflare-email";
import { TestMessageProvider } from "../src/server/jobs/provider";
import { JobQueue, registerWorkers } from "../src/server/jobs/queue";
import { ResendMessageProvider } from "../src/server/jobs/resend";

import { ResendReceivingProvider } from "../src/server/jobs/resend-receiving";
import { assertRecoveryOpen } from "../src/server/recovery/quarantine";

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
    : env.email.provider === "cloudflare" &&
        env.email.from &&
        process.env.EMAIL_RELAY_URL &&
        process.env.EMAIL_RELAY_SECRET &&
        process.env.EMAIL_ACCESS_CLIENT_ID &&
        process.env.EMAIL_ACCESS_CLIENT_SECRET
      ? new CloudflareMessageProvider({
          relayUrl: process.env.EMAIL_RELAY_URL,
          relaySecret: process.env.EMAIL_RELAY_SECRET,
          accessClientId: process.env.EMAIL_ACCESS_CLIENT_ID,
          accessClientSecret: process.env.EMAIL_ACCESS_CLIENT_SECRET,
          from: env.email.from,
          hosts: env.hosts,
        })
      : null;
if (!provider)
  throw new Error(
    "Set EMAIL_PROVIDER=resend with EMAIL_FROM and RESEND_API_KEY; or EMAIL_PROVIDER=cloudflare with EMAIL_FROM, EMAIL_RELAY_URL, EMAIL_RELAY_SECRET, EMAIL_ACCESS_CLIENT_ID and EMAIL_ACCESS_CLIENT_SECRET; or enable the loopback-only test outbox",
  );
const receiving =
  process.env.CASE_INBOUND_ENABLED === "1"
    ? (() => {
        if (
          env.testOutbox ||
          env.email.provider !== "resend" ||
          !process.env.RESEND_API_KEY ||
          !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(
            process.env.CASE_REPLY_DOMAIN ?? "",
          )
        )
          throw new Error(
            "Inbound receiving requires explicit Resend credentials and reply domain outside test outbox",
          );
        return {
          provider: new ResendReceivingProvider(process.env.RESEND_API_KEY),
          replyDomain: process.env.CASE_REPLY_DOMAIN ?? "",
        };
      })()
    : undefined;
const client = postgres(env.databaseUrl, {
  max: 8,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 1800,
  onnotice: () => {},
  ...databaseTransport(env.databaseUrl).postgresOptions,
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
  await assertRecoveryOpen(db);
  await queue.start();
  await registerWorkers(queue, { db, provider, receiving });
  await queue.scheduleRecurring();
  await queue.send("worker.heartbeat", {});
  console.log("MS Realty queue worker started");
} catch {
  console.error("MS Realty queue worker failed; inspect redacted operational records");
  process.exitCode = 1;
  await stop();
}
