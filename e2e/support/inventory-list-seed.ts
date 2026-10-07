// O10 browser seed: four listings sharing one search token — in review, availability to
// confirm (long-term rent), settled and assigned to the broker, and a plain draft — plus the
// broker session. Synthetic records in the disposable browser database only.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { hashRequest } from "@/server/crypto";
import { createListingFixture, type ListingFixtureOptions } from "@/server/publication/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The inventory list seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const broker = await staffFixture(db);
  const token = randomBytes(5).toString("hex");
  const draft = (title: string) => ({
    title,
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
  // Same lock and unique reference rewrite as the discovery and media order fixtures.
  const listing = (name: string, options: Partial<ListingFixtureOptions>, assigned = false) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
      );
      const item = await createListingFixture(tx, { reviewerId: broker.id, ...options });
      const number = randomBytes(6).readUIntBE(0, 6).toString();
      const reference = `MS-${number}`;
      await tx
        .update(schema.listings)
        .set({
          reference,
          draft: draft(`Синтетичен ${name} ${token}`),
          responsibleBrokerId: assigned ? broker.id : null,
        })
        .where(eq(schema.listings.id, item.listingId));
      await tx
        .update(schema.properties)
        .set({ reference: `PR-2026-${number}` })
        .where(eq(schema.properties.id, item.propertyId));
      await tx
        .update(schema.sellerInstructions)
        .set({ reference: `SI-2026-${number}` })
        .where(eq(schema.sellerInstructions.listingId, item.listingId));
      return { reference, listingId: item.listingId, revisionId: item.revisionId };
    });
  const review = (await listing("преглед", { editorialState: "in_review" })).reference;
  const availability = (
    await listing("наличност", {
      editorialState: "approved_revision",
      commercialState: "confirmation_required",
      purpose: "long_term_rent",
    })
  ).reference;
  const settledListing = await listing("готов", { editorialState: "approved_revision" }, true);
  const settled = settledListing.reference;
  const draftOnly = (await listing("чернова", { editorialState: "draft" })).reference;
  // An English translation waiting for review against the approved source (O15 work).
  await db
    .update(schema.listings)
    .set({ approvedRevisionId: settledListing.revisionId })
    .where(eq(schema.listings.id, settledListing.listingId));
  await db.insert(schema.localizedRevisions).values({
    listingId: settledListing.listingId,
    sourceRevisionId: settledListing.revisionId,
    locale: "en",
    state: "reviewing",
    title: "Synthetic translation under review",
    body: { description: "Synthetic translation text." },
  });
  // A valid cursor positioned after the oldest match: its later page is empty, total is not.
  const [oldest] = await db
    .select({ id: schema.listings.id, createdAt: schema.listings.createdAt })
    .from(schema.listings)
    .where(eq(schema.listings.reference, review))
    .limit(1);
  const exhausted = Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: oldest?.createdAt.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      id: oldest?.id,
      filter: hashRequest({
        actor: broker.actor,
        q: token,
        purpose: null,
        type: null,
        view: "all",
      }),
    }),
  ).toString("base64url");
  console.log(
    JSON.stringify({
      token,
      review,
      availability,
      settled,
      draftOnly,
      session: broker.token,
      exhausted,
    }),
  );
} finally {
  await connection.end();
}
