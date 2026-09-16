import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { reorderListingMediaDurably } from "../lib/media-durable-store.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";
import { mediaGalleryRevision } from "../lib/media-gallery-order.mjs";

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

test("the rendered gallery order keeps hidden relations and duplicate assets through durable readback", async () => {
  const seed = structuredClone(loadCmsSeed());
  const listing = seed.records.find((record) => record.collection === "listings" && record.id === "MS-00815");
  listing.media = Array.from({ length: 55 }, (_, index) => ({
    url: `https://example.test/gallery/${index === 52 ? 7 : index}.jpg`,
    kind: index === 3 ? "document" : "photo",
    alt: `Asset ${index}`,
    is_public: false,
    review_status: "needs_media_review",
  }));
  const runtime = createPayloadDraftRuntime(seed);
  const rows = () => runtime.currentRows();
  const assetIds = () => {
    const byId = new Map(rows().media_assets.map((asset) => [asset.id, mediaAssetId(asset)]));
    return rows().listings.find((row) => row.id === listing.id).media.map((id) => byId.get(id));
  };
  const before = assetIds();
  // This is the same order carried in data-media-order: only the first fifty
  // supported tiles are rendered, while the request remains a full relation.
  const renderedEntries = before.map((asset_id, entry) => ({ asset_id, entry, kind: entry === 3 ? "document" : "photo" }))
    .filter((row) => row.kind === "photo").slice(0, 50);
  const moved = renderedEntries.at(-1);
  const requested = before.map((asset_id, entry) => ({ asset_id, entry }));
  const from = requested.findIndex((row) => row.entry === moved.entry);
  requested.unshift(requested.splice(from, 1)[0]);
  const outcome = await reorderListingMediaDurably(
    { listingId: listing.id, assetIds: requested.map((row) => row.asset_id) },
    { payload: runtime.payload, principal },
  );
  assert.equal(outcome.idempotent, false);
  const after = assetIds();
  assert.deepEqual(after, requested.map((row) => row.asset_id));
  assert.equal(after.length, 55);
  assert.equal(after.filter((id) => id === before[7]).length, 2, "duplicate source asset remains duplicated");
  assert.deepEqual(after.filter((_, index) => index !== 0).filter((id) => id === before[3]), [before[3]], "excluded relation remains present");
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

test("an old editor cannot overwrite a concurrent reorder with unchanged gallery membership", async () => {
  const { runtime, listing, order, rows } = fixture();
  const before = order();
  const revision = mediaGalleryRevision(rows().listings.find(row => row.id === listing.id).media);
  const wanted = [...before].reverse();
  const saved = await reorderListingMediaDurably({ listingId: listing.id, assetIds: wanted, galleryRevision: revision }, { payload: runtime.payload, principal });
  assert.notEqual(saved.gallery_revision, revision);
  await assert.rejects(() => reorderListingMediaDurably({ listingId: listing.id, assetIds: before, galleryRevision: revision }, { payload: runtime.payload, principal }), error => error.code === "media_order_stale" && error.status === 409);
  assert.deepEqual(order(), wanted);
  const retry = await reorderListingMediaDurably({ listingId: listing.id, assetIds: wanted, galleryRevision: saved.gallery_revision }, { payload: runtime.payload, principal });
  assert.equal(retry.idempotent, true);
});

test("moving a duplicate source preserves the selected media record and every other relation", async () => {
  const { runtime, listing, order, rows } = fixture();
  const before = [...rows().listings.find(row => row.id === listing.id).media];
  const assets = order();
  const duplicate = assets.findIndex((id, index) => assets.indexOf(id) !== index && before[assets.indexOf(id)] !== before[index]);
  assert.ok(duplicate > 0, "fixture has distinct media records for a repeated source");
  const indices = [duplicate, ...before.map((_, index) => index).filter(index => index !== duplicate)];
  const wantedRelations = indices.map(index => before[index]);
  await reorderListingMediaDurably({
    listingId: listing.id,
    assetIds: indices.map(index => assets[index]),
    relationOrder: wantedRelations.map(String),
    galleryRevision: mediaGalleryRevision(before),
  }, { payload: runtime.payload, principal });
  assert.deepEqual(rows().listings.find(row => row.id === listing.id).media, wantedRelations);
});

test("relation orders cannot attach foreign records, mismatch assets, or omit the revision", async () => {
  const { runtime, listing, order, rows } = fixture();
  const before = [...rows().listings.find(row => row.id === listing.id).media];
  const assetIds = order();
  const relationOrder = before.map(String);
  const galleryRevision = mediaGalleryRevision(before);
  const different = assetIds.findIndex(id => id !== assetIds[0]);
  assert.ok(different > 0);
  const mismatchedAssets = [...assetIds];
  [mismatchedAssets[0], mismatchedAssets[different]] = [mismatchedAssets[different], mismatchedAssets[0]];
  for (const request of [
    { assetIds, relationOrder: ["foreign-record", ...relationOrder.slice(1)], galleryRevision },
    { assetIds: mismatchedAssets, relationOrder, galleryRevision },
    { assetIds, relationOrder },
  ]) {
    await assert.rejects(() => reorderListingMediaDurably({ listingId: listing.id, ...request }, { payload: runtime.payload, principal }), error => ["media_order_invalid", "media_order_stale"].includes(error.code));
    assert.deepEqual(rows().listings.find(row => row.id === listing.id).media, before);
  }
});
