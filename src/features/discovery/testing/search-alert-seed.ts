// Synthetic, disposable browser fixtures. No provider is enabled and no mail is sent.
// The generated E2E database owns these audit/consent records until suite teardown.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Capability } from "@/domain/capabilities";
import { createSession } from "@/server/auth/sessions";
import { createContent, decideContent, readContentWorkbench } from "@/server/content/commands";
import { consentTerms } from "@/server/privacy/preferences";
import { createClient, createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Search-alert fixture requires the generated disposable E2E database");
const connection = postgres(url, { max: 1 }),
  db = drizzle(connection, { schema });
try {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('synthetic-search-alert-terms',0))`,
    );
    if (await consentTerms(tx, "search_alerts", "bg")) return;
    const staff = await createStaff(tx, {
      grants: ["content.edit", "listing.review_facts", "claim.approve", "publication.release"].map(
        (capability) => ({ capability: capability as Capability }),
      ),
    });
    await tx.insert(schema.passkeys).values(
      [0, 1].map(() => ({
        principalId: staff.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
    const { session } = await createSession(tx, { kind: "staff", id: staff.id });
    const created = await createContent(tx, session, {
      operationId: randomUUID(),
      kind: "help",
      slug: "search-alert-consent",
      title: "Синтетични условия за известия — само тест",
      text: "Синтетично съгласие само за този изолиран тест. Не е реална политика.",
      jurisdiction: "Synthetic test",
      reviewScope: "Disposable fixture only",
    });
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const { page } = await readContentWorkbench(tx, session, created.outcome.id);
      await decideContent(tx, session, {
        operationId: randomUUID(),
        id: page.id,
        expectedVersion: page.version,
        decision,
        note: "Explicit synthetic fixture review",
        reviewed: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    if (!(await consentTerms(tx, "search_alerts", "bg")))
      throw new Error("Missing synthetic consent terms");
  });
  const client = await createClient(db);
  const [contact] = await db
    .insert(schema.contactMethods)
    .values({
      partyId: client.partyId,
      kind: "email",
      value: client.email,
      normalizedValue: client.email,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning({ id: schema.contactMethods.id });
  if (!contact) throw new Error("Missing synthetic verified contact");
  const unverifiedEmail = `unverified-${randomUUID()}@example.test`;
  await db.insert(schema.contactMethods).values({
    partyId: client.partyId,
    kind: "email",
    value: unverifiedEmail,
    normalizedValue: unverifiedEmail,
    verification: "unverified",
  });
  const { token } = await createSession(db, { kind: "client", id: client.id });
  console.log(
    JSON.stringify({
      token,
      partyId: client.partyId,
      contactId: contact.id,
      email: client.email,
      unverifiedEmail,
    }),
  );
} finally {
  await connection.end();
}
