import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { reviewContactFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const reviewer = await staffFixture(db),
    denied = await staffFixture(db);
  await db.insert(schema.grants).values(
    ["access.grant", "audit.read"].map((capability) => ({
      principalId: reviewer.id,
      capability: capability as "access.grant" | "audit.read",
      reason: "Synthetic O27 reviewed merge authority",
    })),
  );
  const left = await reviewContactFixture(db, "Synthetic identity merge source A"),
    right = await reviewContactFixture(db, "Synthetic identity merge source B");
  const propertyRows = await db
    .insert(schema.properties)
    .values(
      [0, 1].map(() => ({
        reference: `PROP-${randomUUID()}`,
        propertyType: "apartment" as const,
        country: "BG",
        region: "Synthetic region",
        settlement: "Sandanski",
      })),
    )
    .returning();
  const [propertyLeft, propertyRight] = propertyRows;
  if (!propertyLeft || !propertyRight) throw new Error("Missing synthetic property pair");
  // This reviewer owns these four synthetic identities. Other browser journeys share the
  // disposable database; their records must not change this reviewer's picker or its pages.
  await db.insert(schema.grants).values([
    ...[left.party.id, right.party.id].map((recordId) => ({
      principalId: reviewer.id,
      capability: "import.run" as const,
      recordType: "party",
      recordId,
      reason: "Synthetic O27 scoped identity review",
    })),
    ...propertyRows.map(({ id: recordId }) => ({
      principalId: reviewer.id,
      capability: "import.run" as const,
      recordType: "property",
      recordId,
      reason: "Synthetic O27 scoped identity review",
    })),
  ]);
  await db.insert(schema.listings).values(
    propertyRows.map((property) => ({
      reference: `LIST-${randomUUID()}`,
      propertyId: property.id,
      purpose: "sale" as const,
    })),
  );
  console.log(
    JSON.stringify({
      token: reviewer.token,
      deniedToken: denied.token,
      party: {
        left: left.party.id,
        right: right.party.id,
        leftLabel: left.party.displayName,
        rightLabel: right.party.displayName,
      },
      property: {
        left: propertyLeft.id,
        right: propertyRight.id,
        leftLabel: propertyLeft.reference,
        rightLabel: propertyRight.reference,
      },
    }),
  );
} finally {
  await connection.end();
}
