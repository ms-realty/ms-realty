import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { reorderListingMediaDurably } from "../lib/media-durable-store.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const principal = { id: "payload-3", roles: ["admin"], source: "payload_session", can_mutate: true };

function fixture() {
  const runtime = createPayloadDraftRuntime(loadCmsSeed());
  const rows = () => runtime.currentRows();
  const listing = rows().listings.find((row) => Array.isArray(row.media) && row.media.length > 2);
  const assetOf = (id) => {
    const asset = rows().media_assets.find((row) => row.id === id);
    try {
      return asset ? mediaAssetId(asset) : null;
    } catch {
      return null;
    }
  };
  const order = () => rows().listings.find((row) => row.id === listing.id).media.map(assetOf);
  return { runtime, listing, order, rows };
}

// Gallery order is the listing's own media array, so the cover is simply the
// first entry. Nothing new is stored to express it.
test("moving a photo to the front makes it the cover and keeps every other photo", async () => {
  const { runtime, listing, order } = fixture();
  const before = order();
  const wanted = [before[before.length - 1], ...before.slice(0, -1)];
  const result = await reorderListingMediaDurably(
    { listingId: listing.id, assetIds: wanted },
    { payload: runtime.payload, principal },
  );
  assert.equal(result.kind, "listing_media_order");
  assert.equal(result.idempotent, false);
  const after = order();
  assert.deepEqual(after, wanted);
  assert.equal(after.length, before.length);
  // Every entry still resolves to a row: writing a relation back in the wrong
  // shape would leave a gallery that points at nothing.
  assert.equal(after.every((assetId) => typeof assetId === "string" && assetId), true);
});

test("saving the same order again writes nothing", async () => {
  const { runtime, listing, order } = fixture();
  const wanted = order();
  const result = await reorderListingMediaDurably(
    { listingId: listing.id, assetIds: wanted },
    { payload: runtime.payload, principal },
  );
  assert.equal(result.idempotent, true);
  assert.deepEqual(order(), wanted);
});

// A tab left open while somebody else added or removed a photo must not be
// able to drop it by submitting the order it still remembers.
test("an order that is not a permutation of the gallery is refused", async () => {
  const { runtime, listing, order } = fixture();
  const current = order();
  const cases = [
    ["a photo left out", current.slice(1)],
    ["a photo listed twice", [current[0], ...current]],
    ["a photo from somewhere else", [...current.slice(1), "media-0000000000000000dead"]],
  ];
  for (const [name, assetIds] of cases) {
    await assert.rejects(
      () => reorderListingMediaDurably({ listingId: listing.id, assetIds }, { payload: runtime.payload, principal }),
      (error) => {
        assert.equal(error.code, "media_order_stale", name);
        assert.equal(error.status, 409, name);
        return true;
      },
      name,
    );
    assert.deepEqual(order(), current, `${name} changed the gallery`);
  }
});

// The same photograph can be attached twice, so an id addresses a set of
// interchangeable rows. A gallery with repeats still has to be reorderable.
test("a gallery that repeats a photo is still reorderable", async () => {
  const { runtime, listing, order } = fixture();
  const current = order();
  const unique = new Set(current);
  assert.ok(current.length > unique.size, "this fixture listing repeats at least one photo");
  const reversed = [...current].reverse();
  await reorderListingMediaDurably(
    { listingId: listing.id, assetIds: reversed },
    { payload: runtime.payload, principal },
  );
  assert.deepEqual(order(), reversed);
});

// Reordering is not a publication decision.
test("reordering changes no review or publication state", async () => {
  const { runtime, listing, order, rows } = fixture();
  const snapshot = rows().media_assets.map((row) => `${row.id}:${row.is_public}:${row.review_status}`).sort();
  const reversed = [...order()].reverse();
  await reorderListingMediaDurably(
    { listingId: listing.id, assetIds: reversed },
    { payload: runtime.payload, principal },
  );
  assert.deepEqual(rows().media_assets.map((row) => `${row.id}:${row.is_public}:${row.review_status}`).sort(), snapshot);
});

test("an unknown listing is refused before anything is written", async () => {
  const { runtime } = fixture();
  await assert.rejects(
    () => reorderListingMediaDurably({ listingId: "MS-99999", assetIds: [] }, { payload: runtime.payload, principal }),
    (error) => {
      assert.equal(error.status, 404);
      return true;
    },
  );
});
