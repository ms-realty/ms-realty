import test from "node:test";
import assert from "node:assert/strict";
import config, {
  listingDeleteSearchOutboxHook,
  propertyDeleteSearchOutboxHook,
  propertySearchOutboxHook,
} from "../../payload.config.js";

function fakePayload({ duplicate = false } = {}) {
  const creates = [];
  return {
    creates,
    payload: {
      async create(input) {
        creates.push(input);
        if (duplicate) throw Object.assign(new Error("duplicate search outbox event"), { code: "23505" });
      },
    },
  };
}

test("property change enqueues an upsert for its legacy listing", async () => {
  const fake = fakePayload();
  const doc = { legacy_listing_id: "MS-CRAWL-0001", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await propertySearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.deepEqual(fake.creates, [
    {
      collection: "search_outbox",
      data: {
        id: "search-c2VhcmNoOk1TLUNSQVdMLTAwMDE6dXBzZXJ0OjIwMjYtMDctMzBUMTA6MDA6MDAuMDAwWg",
        listing: "MS-CRAWL-0001",
        event_type: "upsert",
        outbox_state: "pending",
        idempotency_key: "search:MS-CRAWL-0001:upsert:2026-07-30T10:00:00.000Z",
        payload: { schema_version: 1, listing_id: "MS-CRAWL-0001", change_token: "2026-07-30T10:00:00.000Z" },
        attempts: 0,
      },
      req: { payload: fake.payload },
    },
  ]);
});

test("listing deletion enqueues an unlinked delete event after the Listing is gone", async () => {
  const fake = fakePayload();
  const doc = { id: "MS-CRAWL-0001", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await listingDeleteSearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0].data.event_type, "delete");
  assert.equal(fake.creates[0].data.listing, undefined);
  assert.equal(fake.creates[0].data.idempotency_key, "search:MS-CRAWL-0001:delete:2026-07-30T10:00:00.000Z");
  assert.deepEqual(fake.creates[0].data.payload, {
    schema_version: 1,
    listing_id: "MS-CRAWL-0001",
    change_token: "2026-07-30T10:00:00.000Z",
  });
});

test("property deletion recomputes its surviving legacy listing", async () => {
  const fake = fakePayload();
  const doc = { legacy_listing_id: "MS-CRAWL-0001", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await propertyDeleteSearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0].data.event_type, "upsert");
  assert.equal(fake.creates[0].data.listing, "MS-CRAWL-0001");
  assert.equal(fake.creates[0].data.idempotency_key, "search:MS-CRAWL-0001:upsert:2026-07-30T10:00:00.000Z");
  assert.equal(fake.creates[0].data.payload.listing_id, "MS-CRAWL-0001");
});

test("property outbox hooks ignore duplicate idempotency conflicts", async () => {
  const fake = fakePayload({ duplicate: true });
  const doc = { legacy_listing_id: "MS-CRAWL-0001", updatedAt: "2026-07-30T10:00:00.000Z" };

  await assert.doesNotReject(() => propertySearchOutboxHook({ doc, req: { payload: fake.payload } }));
  assert.equal(fake.creates.length, 1);
});

test("listings and properties register the search outbox lifecycle hooks", async () => {
  const listings = (await config).collections.find((collection) => collection.slug === "listings");
  const properties = (await config).collections.find((collection) => collection.slug === "properties");

  assert.deepEqual(listings.hooks.afterDelete, [listingDeleteSearchOutboxHook]);
  assert.deepEqual(listings.hooks.beforeDelete || [], []);
  assert.deepEqual(properties.hooks.afterChange, [propertySearchOutboxHook]);
  assert.deepEqual(properties.hooks.afterDelete, [propertyDeleteSearchOutboxHook]);
});
