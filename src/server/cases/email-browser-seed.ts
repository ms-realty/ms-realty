// Synthetic fixture only in the generated, disposable browser database.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { caseFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await caseFixture(db),
    address = `email-${randomUUID()}@example.test`;
  const [contact] = await db
    .insert(schema.contactMethods)
    .values({
      partyId: f.client.partyId,
      kind: "email",
      value: address,
      normalizedValue: address,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("No contact");
  await db.insert(schema.subscriptions).values({
    partyId: f.client.partyId,
    contactMethodId: contact.id,
    purpose: "service_updates",
    state: "active",
    verifiedAt: new Date(),
    timezone: "Europe/Sofia",
    policyVersion: "synthetic-explicit-service-eligibility",
    unsubscribeTokenHash: randomUUID(),
  });
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      address,
    }),
  );
} finally {
  await connection.end();
}
