// The "Ready to publish" view and its counts are bounded: a few hundred unpublished listings
// cost one page of work per request, not one full view for every listing (ADR 0012).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { listings } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { createStaff } from "../testing";
import { listingPublishStatus, readyExamineCap, readyPageSize, readyToPublish } from "./attested";
import { createListingFixture, createPlaces, type PlaceFixture } from "./testing";

let t: TestDatabase;
let broker: Awaited<ReturnType<typeof staffFixture>>;
let author: { id: string };
let places: PlaceFixture;
const seeded: { reference: string; listingId: string }[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  broker = await staffFixture(t.db);
  author = await createStaff(t.db, { roles: ["content_editor"] });
  places = await createPlaces(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const seed = async (count: number, title = "Двустаен апартамент") => {
  for (let index = 0; index < count; index++)
    seeded.push(
      await createListingFixture(t.db, {
        reviewerId: author.id,
        placeId: places.settlementId,
        editorialState: "needs_facts",
        commercialState: "confirmation_required",
        availabilityConfirmedAt: null,
        sellerInstruction: false,
        photos: 0,
        title: `${title} ${randomUUID().slice(0, 6)}`,
      }),
    );
};

/** Runs the read against a logging database and returns what it cost. */
async function measure<T>(run: (db: TestDatabase["db"]) => Promise<T>) {
  const statements: string[] = [];
  const db = drizzle(t.sql, { schema, logger: { logQuery: (query) => statements.push(query) } });
  const started = performance.now();
  const result = await run(db);
  return { result, queries: statements.length, ms: performance.now() - started };
}

describe("Ready to publish stays bounded however many listings wait", () => {
  it("reads one page per request and its cost does not grow with the listings", async () => {
    await seed(130);
    const small = await measure((db) => readyToPublish(db, broker.actor));
    expect(small.result.rows).toHaveLength(readyPageSize);
    expect(small.result.nextCursor).toMatch(/^MS-/);
    expect(small.result.remaining).toBeGreaterThan(100);

    await seed(130, "Тристаен апартамент");
    const large = await measure((db) => readyToPublish(db, broker.actor));
    expect(large.result.rows).toHaveLength(readyPageSize);
    expect(large.result.remaining).toBeGreaterThan(small.result.remaining);
    // Doubling the waiting listings adds no work to a page: the same queries, one count aside.
    expect(Math.abs(large.queries - small.queries)).toBeLessThanOrEqual(2);
    expect(large.queries).toBeLessThanOrEqual(readyExamineCap * 30);
    expect(large.ms).toBeLessThan(20_000);
  });

  it("walks every listing through the cursor, once each", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 40; pages++) {
      const page = await readyToPublish(t.db, broker.actor, cursor ? { cursor } : {});
      seen.push(...page.rows.map((row) => row.reference));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(seeded.length);
    expect(seen).toEqual([...seen].sort());
  }, 120_000);

  it("narrows by pasted references, separated by spaces or commas, and by title", async () => {
    const [a, b, c] = [seeded[3], seeded[40], seeded[200]];
    if (!a || !b || !c) throw new Error("seed missing");
    const pasted = await readyToPublish(t.db, broker.actor, {
      query: `${a.reference}, ${b.reference}  ${c.reference.toLowerCase()}`,
    });
    expect(pasted.rows.map((row) => row.reference).sort()).toEqual(
      [a.reference, b.reference, c.reference].sort(),
    );
    expect(pasted.nextCursor).toBeNull();
    const byTitle = await readyToPublish(t.db, broker.actor, { query: "Тристаен" });
    expect(byTitle.rows.length).toBeGreaterThan(0);
    expect(byTitle.rows.every((row) => row.title.startsWith("Тристаен"))).toBe(true);
    const none = await readyToPublish(t.db, broker.actor, { query: "MS-NO-SUCH-NUMBER" });
    expect(none).toMatchObject({ rows: [], nextCursor: null, remaining: 0 });
  });

  it("states how many photos a row will show", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      editorialState: "needs_facts",
      commercialState: "confirmation_required",
      availabilityConfirmedAt: null,
      sellerInstruction: false,
      photos: 3,
      photoState: "pending",
    });
    const page = await readyToPublish(t.db, broker.actor, { query: f.reference });
    expect(page.rows[0]?.photoCount).toBe(3);
  });

  it("caps the Today count and says so instead of reading every listing", async () => {
    const ids = (await t.db.select({ id: listings.id }).from(listings)).map((row) => row.id);
    expect(ids.length).toBeGreaterThan(200);
    const outcome = await measure((db) => listingPublishStatus(db, broker.actor, ids));
    expect(outcome.result.capped).toBe(true);
    expect(outcome.result.examinedIds.size).toBeLessThanOrEqual(40);
    expect([...outcome.result.status.values()].filter((s) => s.ready).length).toBeLessThanOrEqual(
      30,
    );
    expect(outcome.queries).toBeLessThanOrEqual(40 * 30);
  });
});
