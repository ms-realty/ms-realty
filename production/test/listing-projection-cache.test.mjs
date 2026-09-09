import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { invalidateListingProjection, projectListingDraftSeed, saveListingDraft } from "../lib/listing-draft-service.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

function counting(runtime) {
  let reads = 0;
  const payload = new Proxy(runtime.payload, {
    get(target, key) {
      const value = target[key];
      if (key === "find") return (...args) => { reads += 1; return value.apply(target, args); };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { payload, reads: () => reads };
}

test("reads outside a transaction share one projection inside the window and coalesce concurrent misses", async () => {
  const seed = loadCmsSeed();
  const { payload, reads } = counting(createPayloadDraftRuntime(seed));
  let clock = 1_000;
  const options = { payload, cacheTtlMs: 500, now: () => clock };
  const [a, b] = await Promise.all([projectListingDraftSeed(seed, options), projectListingDraftSeed(seed, options)]);
  assert.equal(a, b, "concurrent misses resolve to the same projection");
  const first = reads();
  assert.ok(first > 0);
  const c = await projectListingDraftSeed(seed, options);
  assert.equal(c, a);
  assert.equal(reads(), first, "a warm read touches Payload zero times");
  clock += 600;
  const d = await projectListingDraftSeed(seed, options);
  assert.notEqual(d, a, "the window expired, the projection was rebuilt");
  assert.ok(reads() > first);
});

test("a save invalidates the shared projection so the operator sees their own change", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const { payload, reads } = counting(runtime);
  const options = { payload, cacheTtlMs: 60_000 };
  const before = await projectListingDraftSeed(seed, options);
  const listing = before.records.find((record) => record.collection === "listings");
  const warm = reads();
  await projectListingDraftSeed(seed, options);
  assert.equal(reads(), warm);
  await saveListingDraft(seed, {
    payload: runtime.payload,
    principal: { id: "editor_bg", roles: ["editor"], source: "admin" },
    input: { listingId: listing.id, patch: { title: "Projection cache test title" } },
  });
  const after = await projectListingDraftSeed(seed, options);
  assert.notEqual(after, before, "the projection after a save is a fresh one");
  assert.ok(reads() > warm);
});

test("in-transaction reads and a zero window never use the cache", async () => {
  const seed = loadCmsSeed();
  const { payload, reads } = counting(createPayloadDraftRuntime(seed));
  await projectListingDraftSeed(seed, { payload, cacheTtlMs: 0 });
  const first = reads();
  await projectListingDraftSeed(seed, { payload, cacheTtlMs: 0 });
  assert.ok(reads() > first, "cacheTtlMs 0 reads every time");
  invalidateListingProjection();
});
