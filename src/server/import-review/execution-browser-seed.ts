// O28 browser evidence uses only a disposable synthetic database and identities.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { emptyDraft } from "@/server/inventory/contracts";
import { nextReference } from "@/server/references";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const staff = await staffFixture(db);
  await db.insert(schema.grants).values({
    principalId: staff.id,
    capability: "import.run",
    reason: "Synthetic F32/O28 reviewed import browser authority",
  });
  const base = 800000000 + Number.parseInt(randomUUID().slice(0, 6), 16);
  const refs = Array.from({ length: 14 }, (_, i) => `MS-${base + i}`);
  const [property] = await db
    .insert(schema.properties)
    .values({
      reference: await nextReference(db, "property"),
      propertyType: "apartment",
      country: "BG",
      region: "Synthetic region",
      settlement: "Synthetic settlement",
    })
    .returning();
  if (!property) throw new Error("Synthetic property insert failed");
  const draft = {
    ...emptyDraft,
    title: "Existing source title",
    price: "100",
    priceState: "known" as const,
    sourceReference: `https://example.test/${refs[0]}`,
    sourceClass: "owner_confirmed" as const,
  };
  const [listing] = await db
    .insert(schema.listings)
    .values({ reference: refs[0] as string, propertyId: property.id, purpose: "sale", draft })
    .returning();
  if (!listing) throw new Error("Synthetic listing insert failed");
  console.log(
    JSON.stringify({
      token: staff.token,
      reviewerId: staff.id,
      refs,
      listingId: listing.id,
      originalDraft: draft,
    }),
  );
} finally {
  await connection.end();
}
