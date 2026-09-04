import test from "node:test";
import assert from "node:assert/strict";
import config, {
  listingDeleteSearchOutboxHook,
  listingSearchOutboxHook,
  propertyDeleteSearchOutboxHook,
  propertySearchOutboxHook,
} from "../../payload.config.js";

function fakePayload({ duplicate = false } = {}) {
  const creates = [];
  return {
    creates,
    payload: {
      async find() {
        return { docs: [] };
      },
      async create(input) {
        creates.push(input);
        if (duplicate) throw Object.assign(new Error("duplicate search outbox event"), { code: "23505" });
      },
    },
  };
}

test("property change enqueues an upsert for its legacy listing", async () => {
  const fake = fakePayload();
  const doc = { legacy_listing_id: "MS-00815", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await propertySearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.deepEqual(fake.creates, [
    {
      collection: "search_outbox",
      data: {
        id: "search-c2VhcmNoOk1TLUNSQVdMLTAwMDE6dXBzZXJ0OjIwMjYtMDctMzBUMTA6MDA6MDAuMDAwWg",
        listing: "MS-00815",
        event_type: "upsert",
        outbox_state: "pending",
        idempotency_key: "search:MS-00815:upsert:2026-07-30T10:00:00.000Z",
        payload: { schema_version: 1, listing_id: "MS-00815", change_token: "2026-07-30T10:00:00.000Z" },
        attempts: 0,
      },
      overrideAccess: true,
      req: { payload: fake.payload },
    },
  ]);
});

test("listing changes use internal authority for server-owned work items", async () => {
  const fake = fakePayload();
  const req = { payload: fake.payload };
  const doc = {
    id: "MS-00815",
    property: "property-MS-00815",
    updatedAt: "2026-07-30T10:00:00.000Z",
  };

  assert.equal(await listingSearchOutboxHook({ doc, operation: "update", req }), doc);
  assert.deepEqual(
    fake.creates.map(({ collection, overrideAccess }) => ({ collection, overrideAccess })),
    [
      { collection: "listing_enrichment_tasks", overrideAccess: true },
      { collection: "search_outbox", overrideAccess: true },
    ],
  );
});

test("listing changes reuse an existing deterministic enrichment task without attempting a duplicate write", async () => {
  const creates = [];
  const finds = [];
  const req = {
    payload: {
      async find(input) {
        finds.push(input);
        return { docs: [{ id: "enrichment-MS-00815" }] };
      },
      async create(input) {
        creates.push(input);
      },
    },
  };
  const doc = { id: "MS-00815", property: "property-MS-00815", updatedAt: "2026-08-10T18:45:00.000Z" };

  await assert.doesNotReject(() => listingSearchOutboxHook({ doc, operation: "update", req }));
  assert.equal(finds.length, 1);
  assert.deepEqual(finds[0].where, { id: { equals: "enrichment-MS-00815" } });
  assert.deepEqual(creates.map((input) => input.collection), ["search_outbox"]);
});

test("standalone enrichment task creation tolerates a concurrent duplicate", async () => {
  const req = {
    payload: {
      async find() {
        return { docs: [] };
      },
      async create(input) {
        if (input.collection === "listing_enrichment_tasks") {
          throw Object.assign(new Error("duplicate enrichment task"), { code: "23505" });
        }
      },
    },
  };

  await assert.doesNotReject(() =>
    listingSearchOutboxHook({
      doc: { id: "MS-00815", property: "property-MS-00815", updatedAt: "2026-08-10T18:45:00.000Z" },
      operation: "update",
      req,
    }),
  );
});

test("transactional enrichment duplicates escape so the outer transaction can retry", async () => {
  const duplicate = Object.assign(new Error("duplicate enrichment task"), { code: "23505" });
  const req = {
    transactionID: "tx-1",
    payload: {
      async find() {
        return { docs: [] };
      },
      async create(input) {
        if (input.collection === "listing_enrichment_tasks") throw duplicate;
      },
    },
  };

  await assert.rejects(
    () =>
      listingSearchOutboxHook({
        doc: { id: "MS-00815", property: "property-MS-00815", updatedAt: "2026-08-10T18:45:00.000Z" },
        operation: "update",
        req,
      }),
    (error) => error === duplicate,
  );
});

test("listing deletion enqueues an unlinked delete event after the Listing is gone", async () => {
  const fake = fakePayload();
  const doc = { id: "MS-00815", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await listingDeleteSearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0].data.event_type, "delete");
  assert.equal(fake.creates[0].data.listing, undefined);
  assert.equal(fake.creates[0].data.idempotency_key, "search:MS-00815:delete:2026-07-30T10:00:00.000Z");
  assert.deepEqual(fake.creates[0].data.payload, {
    schema_version: 1,
    listing_id: "MS-00815",
    change_token: "2026-07-30T10:00:00.000Z",
  });
});

test("property deletion recomputes its surviving legacy listing", async () => {
  const fake = fakePayload();
  const doc = { legacy_listing_id: "MS-00815", updatedAt: "2026-07-30T10:00:00.000Z" };

  assert.equal(await propertyDeleteSearchOutboxHook({ doc, req: { payload: fake.payload } }), doc);
  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0].data.event_type, "upsert");
  assert.equal(fake.creates[0].data.listing, "MS-00815");
  assert.equal(fake.creates[0].data.idempotency_key, "search:MS-00815:upsert:2026-07-30T10:00:00.000Z");
  assert.equal(fake.creates[0].data.payload.listing_id, "MS-00815");
});

test("property outbox hooks ignore duplicate idempotency conflicts", async () => {
  const fake = fakePayload({ duplicate: true });
  const doc = { legacy_listing_id: "MS-00815", updatedAt: "2026-07-30T10:00:00.000Z" };

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
