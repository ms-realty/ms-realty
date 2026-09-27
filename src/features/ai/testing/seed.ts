// Explicit synthetic browser fixture. Never loads live provider configuration.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { processAssistanceRun, requestAssistance } from "@/server/ai/assistance";
import { createSession } from "@/server/auth/sessions";
import { JobQueue } from "@/server/jobs/queue";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Synthetic assistance requires the disposable browser database");
const sql = postgres(url, { max: 2 });
const db = drizzle(sql, { schema });
const queue = new JobQueue(url, { producer: true });
try {
  await queue.start();
  const actor = await createStaff(db, {
    roles: ["assigned_broker"],
    grants: [{ capability: "report.read" }],
    email: `${randomUUID()}@example.test`,
  });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { session, token } = await createSession(db, { kind: "staff", id: actor.id });
  const [source] = await db
    .insert(schema.inquiries)
    .values({
      reference: `RQ-SYN-${randomUUID().slice(0, 8)}`,
      purpose: "question",
      source: "website",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      preferredLocale: "en",
      message: "Synthetic visitor asks about 2 bedrooms. Contact withheld@example.test.",
      coverageQueue: "synthetic",
    })
    .returning();
  if (!source) throw new Error("No synthetic source");
  const config = {
    enabled: true,
    model: "synthetic-fixture-model",
    apiKey: "not-used",
    inputCostMicros: 1,
    outputCostMicros: 1,
    dailyLimitMicros: 10000000,
    maxOutputTokens: 1024,
    timeoutMs: 1000,
  };
  const result = await db.transaction(async (tx) => {
    const requested = await requestAssistance(
      tx,
      session,
      {
        id: source.id,
        expectedVersion: source.version,
        operationId: randomUUID(),
        task: "reply_draft",
        sourceReviewed: true,
      },
      { queue, config },
    );
    await processAssistanceRun(tx, requested.outcome.id, {
      config,
      generate: async () => ({
        output: {
          body: "Synthetic draft: you asked about 2 bedrooms.",
          citations: [{ field: "message", quote: "2 bedrooms" }],
          warnings: ["Synthetic fixture only. Availability is not confirmed."],
        },
        inputTokens: 100,
        outputTokens: 30,
      }),
    });
    return requested;
  });
  console.log(
    JSON.stringify({ id: result.outcome.id, sourceId: source.id, actorId: actor.id, token }),
  );
} finally {
  await queue.stop();
  await sql.end();
}
