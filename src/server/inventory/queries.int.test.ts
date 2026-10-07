import { randomUUID } from "node:crypto";
import { eq, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { createClient, createStaff } from "../testing";
import { emptyDraft } from "./contracts";
import { inventoryList, inventoryListPage } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function property(settlement: string, propertyType: "apartment" | "house" = "apartment") {
  const [row] = await t.db
    .insert(s.properties)
    .values({
      reference: `PR-O10-${randomUUID()}`,
      propertyType,
      country: "BG",
      region: "Synthetic region",
      settlement,
      exactAddress: "Synthetic private address",
    })
    .returning();
  if (!row) throw new Error("Missing property fixture");
  return row;
}

async function listing(
  propertyId: string,
  values: Partial<Omit<typeof s.listings.$inferInsert, "createdAt">> & {
    createdAt?: Date | SQL;
  } = {},
) {
  const [row] = await t.db
    .insert(s.listings)
    .values({
      reference: `MS-O10-${randomUUID()}`,
      propertyId,
      purpose: "sale",
      // Synthetic recorded states only: this fixture does not publish or approve any fact.
      editorialState: "approved_revision",
      commercialState: "withdrawn",
      ...values,
    })
    .returning();
  if (!row) throw new Error("Missing listing fixture");
  return row;
}

async function revision(listing: typeof s.listings.$inferSelect, number: number, title: string) {
  const sourceUrl = `https://legacy.example.test/listings/${listing.reference}`;
  const [facts] = await t.db
    .insert(s.propertyFactRevisions)
    .values({
      propertyId: listing.propertyId,
      revisionNumber: number,
      contentDigest: `synthetic-facts-${randomUUID()}`,
      materialChange: "initial",
      createdByKind: "system",
      createdById: "synthetic-import",
    })
    .returning();
  if (!facts) throw new Error("Missing fact revision fixture");
  await t.db.insert(s.propertyFacts).values([
    {
      factRevisionId: facts.id,
      fieldKey: "area.usable",
      state: "known",
      value: { value: 74.5 + number, unit: "m2", basis: "usable" },
      unit: "m2",
      basis: "usable",
      sourceClass: "legacy_import",
      sourceReference: sourceUrl,
      sourceLanguage: "ru",
    },
    {
      factRevisionId: facts.id,
      fieldKey: "bedrooms",
      state: "known",
      value: 0,
      sourceClass: "legacy_import",
      sourceReference: sourceUrl,
      sourceLanguage: "ru",
    },
  ]);
  const [source] = await t.db
    .insert(s.listingRevisions)
    .values({
      listingId: listing.id,
      revisionNumber: number,
      factRevisionId: facts.id,
      terms: {
        purpose: listing.purpose,
        facts: {
          price: {
            state: "known",
            value: {
              amountMinor: 9_500_003 + number,
              currency: "EUR",
              period: "total",
              basis: "asking",
            },
            sourceClass: "legacy_import",
            sourceReference: sourceUrl,
            sourceLanguage: "ru",
          },
        },
      },
      sourceCopy: {
        locale: "bg",
        text: { title, description: "Synthetic source copy", sourceUrl, humanReviewed: false },
        legacySource: { locale: "ru", title: "Синтетический исходный текст" },
      },
      disclosure: { publicPrecision: "settlement" },
      contentDigest: `synthetic-listing-${randomUUID()}`,
      createdByKind: "system",
      createdById: "synthetic-import",
    })
    .returning();
  if (!source) throw new Error("Missing source revision fixture");
  return source;
}

it("O10 searches and pages every readable match beyond 200 despite newer inaccessible rows, with bounded queries", async () => {
  const readable = await property("O10-cap settlement"),
    hidden = await property("O10-cap settlement");
  const staff = await createStaff(t.db, {
    grants: [{ capability: "listing.read", recordType: "property", recordId: readable.id }],
  });
  const accessible = await t.db
    .insert(s.listings)
    .values(
      Array.from({ length: 237 }, (_, index) => ({
        propertyId: readable.id,
        reference: `MS-O10-cap-visible-${index}`,
        purpose: "sale" as const,
        draft: {
          ...emptyDraft,
          sourceReference: "synthetic",
          title: index === 0 ? "Old needle title" : "Visible title",
        },
        createdAt: sql`to_timestamp(${1000 + index})`,
      })),
    )
    .returning();
  await t.db.insert(s.listings).values(
    Array.from({ length: 229 }, (_, index) => ({
      propertyId: hidden.id,
      reference: `MS-O10-cap-hidden-${index}`,
      purpose: "sale" as const,
      draft: { ...emptyDraft, sourceReference: "synthetic", title: "Old needle hidden title" },
      createdAt: sql`to_timestamp(${100000 + index})`,
    })),
  );
  const statements: string[] = [];
  const db = drizzle(t.sql, { schema: s, logger: { logQuery: (query) => statements.push(query) } });
  let page = await inventoryListPage(db, staff.actor, { q: "O10-cap", pageSize: 37 });
  expect(page.total).toBe(237);
  expect(statements.length).toBeLessThanOrEqual(5);
  const seen: string[] = [];
  while (true) {
    expect(page.rows.length).toBeLessThanOrEqual(37);
    expect(page.total).toBe(237);
    expect(page.rows.every((row) => row.property.id === readable.id)).toBe(true);
    seen.push(...page.rows.map((row) => row.listing.id));
    if (!page.nextCursor) break;
    page = await inventoryListPage(t.db, staff.actor, {
      q: "O10-cap",
      pageSize: 37,
      cursor: page.nextCursor,
    });
  }
  expect(seen).toEqual(accessible.map((row) => row.id).reverse());
  expect(new Set(seen).size).toBe(237);
  expect((await inventoryList(t.db, staff.actor)).length).toBe(237);
  const needle = await inventoryListPage(t.db, staff.actor, { q: "old NEEDLE" });
  expect(needle.total).toBe(1);
  expect(needle.rows[0]?.listing.id).toBe(accessible[0]?.id);
  const none = await inventoryListPage(t.db, staff.actor, { q: "cap-hidden" });
  expect(none).toMatchObject({ total: 0, rows: [], nextCursor: null });
});

it("O10 searches draft-empty imports using the latest BG source and keeps its exact facts and evidence", async () => {
  const place = await property("O10-import settlement");
  const imported = await listing(place.id, { draft: {}, editorialState: "needs_facts" });
  const old = await revision(imported, 1, "Older imported title");
  const current = await revision(imported, 2, "Последно заглавие 100%_literal");
  await t.db
    .update(s.listings)
    .set({ latestRevisionNumber: 2, approvedRevisionId: old.id })
    .where(eq(s.listings.id, imported.id));
  const staff = await createStaff(t.db, {
    grants: [{ capability: "listing.read", recordType: "listing", recordId: imported.id }],
  });
  const page = await inventoryListPage(t.db, staff.actor, {
    q: "100%_literal",
    type: "apartment",
    purpose: "sale",
  });
  expect(page.total).toBe(1);
  expect(page.rows[0]).toMatchObject({
    title: "Последно заглавие 100%_literal",
    sourceRevision: { id: current.id, revisionNumber: 2, factRevisionId: current.factRevisionId },
    draftOrigin: "source_revision",
    translationSourceRevisionId: old.id,
    workingDraft: {
      price: "95000.05",
      area: "76.5",
      areaBasis: "usable",
      bedrooms: "0",
      sourceLanguage: "ru",
      sourceClass: "legacy_import",
    },
    listing: { draft: {}, editorialState: "needs_facts", approvedRevisionId: old.id },
    property: { approvedFactRevisionId: null },
  });
  expect(page.rows[0]?.facts).toHaveLength(2);
  expect(
    page.rows[0]?.facts.every(
      (fact) => fact.factRevisionId === current.factRevisionId && fact.reviewedAt === null,
    ),
  ).toBe(true);
  expect((await inventoryListPage(t.db, staff.actor, { q: "Older imported title" })).total).toBe(0);
  expect((await inventoryListPage(t.db, staff.actor, { q: "%_" })).total).toBe(1);
  expect((await inventoryListPage(t.db, staff.actor, { q: "ПОСЛЕДНО ЗАГЛАВИЕ" })).total).toBe(1);
  expect((await inventoryListPage(t.db, staff.actor, { q: "Синтетический исходный" })).total).toBe(
    0,
  );
  const [stored] = await t.db.select().from(s.listings).where(eq(s.listings.id, imported.id));
  expect(stored?.draft).toEqual({});
  expect(
    await t.db
      .select()
      .from(s.currentPublications)
      .where(eq(s.currentPublications.listingId, imported.id)),
  ).toEqual([]);
});

it("O10 Mine and Needs combine recorded listing work and current-source translation review, with locale-scoped action authority", async () => {
  const place = await property("O10-views settlement");
  const staff = await createStaff(t.db, {
    roles: ["content_editor"],
    grants: [
      {
        capability: "translation.review",
        recordType: "property",
        recordId: place.id,
        locales: ["ru"],
      },
    ],
  });
  const other = await createStaff(t.db, { roles: ["assigned_broker"] });
  const cleanMine = await listing(place.id, { responsibleBrokerId: staff.id });
  const pending = await listing(place.id, { responsibleBrokerId: staff.id });
  const old = await revision(pending, 1, "Old translated source");
  const current = await revision(pending, 2, "Current translated source");
  await t.db
    .update(s.listings)
    .set({ latestRevisionNumber: 2, approvedRevisionId: current.id })
    .where(eq(s.listings.id, pending.id));
  await t.db.insert(s.localizedRevisions).values([
    { listingId: pending.id, sourceRevisionId: old.id, locale: "he", state: "reviewing" },
    { listingId: pending.id, sourceRevisionId: current.id, locale: "ru", state: "reviewing" },
    { listingId: pending.id, sourceRevisionId: current.id, locale: "en", state: "reviewing" },
    { listingId: pending.id, sourceRevisionId: current.id, locale: "de", state: "draft" },
  ]);
  const recorded = await Promise.all([
    listing(place.id, { responsibleBrokerId: other.id, editorialState: "changes_requested" }),
    listing(place.id, { responsibleBrokerId: other.id, editorialState: "in_review" }),
    listing(place.id, { responsibleBrokerId: other.id, editorialState: "needs_facts" }),
    listing(place.id, { responsibleBrokerId: other.id, commercialState: "confirmation_required" }),
    listing(place.id, { responsibleBrokerId: other.id, freshnessState: "review_due" }),
  ]);
  const mine = await inventoryListPage(t.db, staff.actor, { q: "O10-views", view: "mine" });
  expect(mine.total).toBe(2);
  expect(mine.rows.map((row) => row.listing.id).sort()).toEqual([cleanMine.id, pending.id].sort());
  const needs = await inventoryListPage(t.db, staff.actor, { q: "O10-views", view: "needs" });
  expect(needs.total).toBe(6);
  expect(new Set(needs.rows.map((row) => row.listing.id))).toEqual(
    new Set([pending.id, ...recorded.map((row) => row.id)]),
  );
  const translated = needs.rows.find((row) => row.listing.id === pending.id);
  expect(translated?.actions).toEqual([
    expect.objectContaining({
      kind: "translation_review",
      locale: "en",
      sourceRevisionId: current.id,
      canReview: false,
    }),
    expect.objectContaining({
      kind: "translation_review",
      locale: "ru",
      sourceRevisionId: current.id,
      canReview: true,
    }),
  ]);
  expect(new Set(translated?.translations.map((row) => row.locale))).toEqual(
    new Set(["de", "en", "ru"]),
  );
  expect(translated?.translations.every((row) => row.canDraft)).toBe(true);
  expect(translated?.needsAction).toBe(true);
  const house = await property("O10-views house", "house");
  const rent = await listing(house.id, { purpose: "long_term_rent" });
  const filtered = await inventoryListPage(t.db, staff.actor, {
    q: "O10-views",
    purpose: "long_term_rent",
    type: "house",
  });
  expect(filtered.total).toBe(1);
  expect(filtered.rows[0]?.listing.id).toBe(rent.id);
});

it("O10 cursor preserves ties and PostgreSQL microseconds through edits and insertion, and counts empty later pages truthfully", async () => {
  const place = await property("O10-stability settlement");
  const staff = await createStaff(t.db, {
    grants: [{ capability: "listing.read", recordType: "property", recordId: place.id }],
  });
  const ids = Array.from(
    { length: 107 },
    (_, index) => `00000010-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  await t.db.insert(s.listings).values(
    ids.map((id, index) => ({
      id,
      propertyId: place.id,
      reference: `MS-O10-stable-${index}`,
      purpose: "sale" as const,
      createdAt: sql`to_timestamp(1) + interval '0.123456 seconds'`,
    })),
  );
  let page = await inventoryListPage(t.db, staff.actor, { q: "O10-stability", pageSize: 25 });
  const firstCursor = page.nextCursor;
  if (!firstCursor) throw new Error("Missing cursor fixture");
  const position = JSON.parse(Buffer.from(firstCursor, "base64url").toString());
  expect(position.createdAt).toMatch(/\.123456Z$/);
  const firstIds = page.rows.map((row) => row.listing.id);
  await t.db
    .update(s.listings)
    .set({ updatedAt: new Date(), editorialState: "in_review" })
    .where(eq(s.listings.id, ids[0] ?? ""));
  const newest = await listing(place.id, { createdAt: sql`to_timestamp(2)` });
  const seen = [...firstIds];
  while (page.nextCursor) {
    page = await inventoryListPage(t.db, staff.actor, {
      q: "O10-stability",
      pageSize: 25,
      cursor: page.nextCursor,
    });
    expect(page.total).toBe(108);
    seen.push(...page.rows.map((row) => row.listing.id));
  }
  expect(seen).toEqual([...ids].reverse());
  expect(new Set(seen).size).toBe(107);
  expect(
    (await inventoryListPage(t.db, staff.actor, { q: "O10-stability", pageSize: 25 })).rows[0]
      ?.listing.id,
  ).toBe(newest.id);
  const emptyCursor = Buffer.from(
    JSON.stringify({ ...position, createdAt: new Date(0).toISOString() }),
  ).toString("base64url");
  expect(
    await inventoryListPage(t.db, staff.actor, { q: "O10-stability", cursor: emptyCursor }),
  ).toMatchObject({ rows: [], total: 108, nextCursor: null });
  await expect(
    inventoryListPage(t.db, staff.actor, { q: "different filter", cursor: firstCursor }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await t.db
    .update(s.grants)
    .set({ revokedAt: new Date() })
    .where(eq(s.grants.principalId, staff.id));
  await expect(
    inventoryListPage(t.db, staff.actor, { q: "O10-stability", cursor: firstCursor }),
  ).rejects.toMatchObject({ code: "forbidden" });
});

it("O10 denies non-staff, unrelated roles, locale-only reads and inactive/revoked authority; listing grants stay exact", async () => {
  const place = await property("O10-authority settlement");
  const visible = await listing(place.id),
    hidden = await listing(place.id);
  const staff = await createStaff(t.db, {
    grants: [{ capability: "listing.read", recordType: "listing", recordId: visible.id }],
  });
  expect(
    await can(t.db, staff.actor, "listing.read", {
      type: "listing",
      id: visible.id,
      propertyId: place.id,
    }),
  ).toBe(true);
  expect(
    await can(t.db, staff.actor, "listing.read", {
      type: "listing",
      id: hidden.id,
      propertyId: place.id,
    }),
  ).toBe(false);
  const page = await inventoryListPage(t.db, staff.actor);
  expect(page.total).toBe(1);
  expect(page.rows.map((row) => row.listing.id)).toEqual([visible.id]);
  const client = await createClient(t.db);
  const denied = await Promise.all([
    createStaff(t.db, { roles: ["external_specialist"] }),
    createStaff(t.db, { roles: ["assigned_broker"], membership: "ended" }),
    createStaff(t.db, { roles: ["assigned_broker"], status: "suspended" }),
    createStaff(t.db, { grants: [{ capability: "listing.read", locales: ["ru"] }] }),
    createStaff(t.db, {
      grants: [{ capability: "listing.read", recordType: "case", recordId: randomUUID() }],
    }),
    createStaff(t.db, { grants: [{ capability: "listing.read", expiresAt: new Date(0) }] }),
  ]);
  for (const actor of [
    { kind: "visitor" as const, id: "synthetic" },
    { kind: "system" as const, id: "synthetic" },
    { kind: "ai_service" as const, id: "synthetic" },
    client.actor,
    ...denied.map((row) => row.actor),
  ]) {
    await expect(inventoryListPage(t.db, actor, { cursor: "malformed" })).rejects.toMatchObject({
      code: "forbidden",
    });
  }
  await expect(inventoryListPage(t.db, staff.actor, { cursor: "malformed" })).rejects.toMatchObject(
    { code: "validation_failed" },
  );
});
