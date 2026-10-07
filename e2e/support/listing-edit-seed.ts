// O12 browser seed: a published listing with a saved BG working draft, two listings with no
// saved draft (one with a BGN price the draft cannot carry), a broker session and a read-only (translation reviewer) session. Synthetic
// records in the disposable browser database only; never launch or acceptance evidence.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "@/server/auth/sessions";
import { staffFixture } from "@/server/cases/testing";
import { createListingFixture, publishForTest } from "@/server/publication/testing";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The listing edit seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const broker = await staffFixture(db);
  const reader = await createStaff(db, {
    roles: ["translation_reviewer"],
    email: `o12-reader-${randomBytes(6).toString("hex")}@example.test`,
  });
  // Staff need two registered passkeys before the workspace opens (as in staffFixture).
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: reader.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const readerSession = await createSession(db, { kind: "staff", id: reader.id });
  // Same lock and unique reference rewrite as the discovery and media order fixtures.
  const listing = (
    title: string,
    draft: Record<string, string>,
    price?: Parameters<typeof createListingFixture>[1]["price"],
    facts?: Parameters<typeof createListingFixture>[1]["facts"],
  ) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
      );
      const item = await createListingFixture(tx, {
        reviewerId: broker.id,
        title,
        description: "Синтетичен тестов имот. Не е реална оферта.",
        photos: 1,
        ...(price ? { price } : {}),
        ...(facts ? { facts } : {}),
      });
      const number = randomBytes(6).readUIntBE(0, 6).toString();
      const reference = `MS-${number}`;
      await tx
        .update(schema.listings)
        .set({ reference, draft })
        .where(eq(schema.listings.id, item.listingId));
      await tx
        .update(schema.properties)
        .set({ reference: `PR-2026-${number}` })
        .where(eq(schema.properties.id, item.propertyId));
      await tx
        .update(schema.sellerInstructions)
        .set({ reference: `SI-2026-${number}` })
        .where(eq(schema.sellerInstructions.listingId, item.listingId));
      return { ...item, reference };
    });
  const fixture = await listing("Синтетичен апартамент за редакция", {
    title: "Синтетичен апартамент за редакция",
    description: "Синтетичен тестов имот. Не е реална оферта.",
    brokerNote: "",
    priceState: "known",
    price: "95000",
    areaState: "known",
    area: "74.5",
    areaBasis: "total",
    bedroomsState: "known",
    bedrooms: "2",
    sourceReference: "synthetic-source-record",
    sourceClass: "agency_observed",
    sourceLanguage: "bg",
  });
  const blank = await listing("Синтетична обява без чернова", {});
  // A recorded price the draft cannot carry (another currency): it must stay visible.
  const bgn = await listing(
    "Синтетична обява с цена в лева",
    {},
    {
      state: "known",
      value: { amountMinor: 11_500_000, currency: "BGN", period: "total", basis: "asking" },
    },
  );
  await publishForTest(db, broker.actor, fixture, ["bg"]);
  // Two recorded area bases: the review shows both, never one picked.
  const twoAreas = await listing("Синтетична обява с две площи", {}, undefined, {
    bedrooms: { state: "known", value: 2 },
    "area.living": {
      state: "known",
      value: { value: 68, unit: "m2", basis: "living" },
      unit: "m2",
    },
    "area.land": { state: "known", value: { value: 450, unit: "m2", basis: "land" }, unit: "m2" },
  });
  console.log(
    JSON.stringify({
      reference: fixture.reference,
      listingId: fixture.listingId,
      blank: { reference: blank.reference, listingId: blank.listingId },
      bgn: { reference: bgn.reference, listingId: bgn.listingId },
      twoAreas: { reference: twoAreas.reference, listingId: twoAreas.listingId },
      token: broker.token,
      brokerId: broker.id,
      readerToken: readerSession.token,
    }),
  );
} finally {
  await connection.end();
}
