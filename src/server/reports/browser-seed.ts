// Synthetic O22 corpus; refuses every database outside the existing disposable E2E harness.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { createStaff } from "../testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Reports fixture requires disposable E2E database");
const client = postgres(url, { max: 2 }),
  db = drizzle(client, { schema });
try {
  const staff = await createStaff(db, {
    email: `${randomUUID()}@example.test`,
    grants: [{ capability: "report.read" }],
  });
  await db.insert(schema.passkeys).values({
    principalId: staff.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  const suffix = randomUUID(),
    visibleReference = `RQ-REPORT-${suffix}`,
    hiddenReference = `RQ-HIDDEN-${suffix}`;
  const rows = await db
    .insert(schema.inquiries)
    .values(
      [visibleReference, hiddenReference].map((reference) => ({
        reference,
        purpose: "question" as const,
        source: "website" as const,
        submissionKey: randomUUID(),
        payloadDigest: "synthetic",
        coverageQueue: "synthetic-coverage",
      })),
    )
    .returning();
  const visible = rows[0];
  if (!visible) throw new Error("Missing report fixture");
  const [task] = await db
    .insert(schema.tasks)
    .values({
      title: "Synthetic report promise",
      ownerId: staff.id,
      inquiryId: visible.id,
      promisedToClient: true,
      dueAt: new Date(Date.now() - 60000),
    })
    .returning();
  if (!task) throw new Error("Missing task fixture");
  await db.insert(schema.grants).values([
    {
      principalId: staff.id,
      capability: "inquiry.read",
      recordType: "inquiry",
      recordId: visible.id,
      reason: "Synthetic report proof",
    },
    {
      principalId: staff.id,
      capability: "task.manage",
      recordType: "task",
      recordId: task.id,
      reason: "Synthetic report proof",
    },
  ]);
  const { token } = await createSession(db, { kind: "staff", id: staff.id });
  console.log(JSON.stringify({ token, visibleReference, hiddenReference }));
} finally {
  await client.end();
}
