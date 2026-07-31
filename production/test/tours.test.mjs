import test from "node:test";
import assert from "node:assert/strict";
import { assertTourApprovals, createTourApproval, createTourField, latestTourForListing, publicTour } from "../lib/tours.mjs";

const media = [
  { url: "https://makler-realty.com/wp-content/themes/Avenue/images/logo.png", alt: "logo_MS_realty" },
  { url: "https://makler-realty.com/wp-content/plugins/qtranslate-x/flags/bg.png", alt: "Bulgarian flag" },
  { url: "https://makler-realty.com/wp-content/uploads/wv.png", alt: "WhatsApp / Viber" },
  {
    url: "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php?src=https://makler-realty.com/wp-content/uploads/2025/04/front.jpg&h=45&w=45&zc=1",
    alt: "Front view",
  },
  { url: "https://makler-realty.com/wp-content/uploads/listing/photo.jpg", alt: "Living room" },
  { url: "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg", alt: "Front view duplicate" },
];

test("tour fields require provider-specific reviewed source, caption, and fallback before public display", () => {
  const draft = createTourField({ listingId: "MS-CRAWL-0001", media });

  assert.equal(draft.provider, "photo-sphere-viewer");
  assert.equal(draft.is_public, false);
  assert.equal(draft.fallback_gallery.length, 1);
  assert.equal(draft.fallback_gallery[0].url, "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg");
  assert.equal(publicTour(draft).available, false);

  assert.throws(
    () => createTourField({ listingId: "MS-CRAWL-0001", panoramaUrl: "http://example.test/panorama.jpg", media }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      createTourField({
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://makler-realty.com/tours/panorama.jpg",
        isPublic: true,
        media,
      }),
    /accessibility_caption/,
  );

  const approved = createTourField({
    listingId: "MS-CRAWL-0001",
    panoramaUrl: "https://makler-realty.com/tours/panorama.jpg",
    accessibilityCaption: "Reviewed 360 panorama of the property interior.",
    isPublic: true,
    media,
  });

  assert.equal(publicTour(approved).available, true);
  assert.equal(publicTour(approved).mount_target, "psv-listing-tour");
  assert.throws(
    () =>
      createTourField({
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://cdn.example.test/panorama.jpg",
        accessibilityCaption: "Reviewed 360 panorama of the property interior.",
        isPublic: true,
        media,
      }),
    /approved MS Realty HTTPS origin/,
  );

  const splat = createTourField({
    listingId: "MS-CRAWL-0001",
    provider: "supersplat-viewer",
    viewerUrl: "https://makler-realty.com/splats/MS-CRAWL-0001/",
    accessibilityCaption: "Reviewed interactive 3D reconstruction of the property interior.",
    isPublic: true,
    media,
  });

  assert.deepEqual(
    publicTour(splat),
    {
      available: true,
      provider: "supersplat-viewer",
      viewer_url: "https://makler-realty.com/splats/MS-CRAWL-0001/",
      thumbnail_url: null,
      accessibility_caption: "Reviewed interactive 3D reconstruction of the property interior.",
      fallback_gallery: splat.fallback_gallery,
    },
  );
  assert.throws(
    () =>
      createTourField({
        listingId: "MS-CRAWL-0001",
        provider: "supersplat-viewer",
        viewerUrl: "http://example.test/splats/MS-CRAWL-0001/",
        media,
      }),
    /HTTPS/,
  );
  assert.throws(
    () => createTourField({ listingId: "MS-CRAWL-0001", provider: "unknown-viewer", media }),
    /Unsupported tour provider/,
  );
});

test("360 tour approval rows are tied to known listings and latest public review wins", () => {
  const seed = {
    records: [
      {
        collection: "listings",
        id: "MS-CRAWL-0001",
        media,
      },
    ],
  };
  const first = createTourApproval(
    seed,
    {
      id: "tour-approval-first",
      listingId: "MS-CRAWL-0001",
      panoramaUrl: "https://makler-realty.com/tours/panorama-first.jpg",
      accessibilityCaption: "First reviewed 360 panorama.",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
    "2026-07-05T00:00:00Z",
  );
  const second = createTourApproval(
    seed,
    {
      id: "tour-approval-second",
      listingId: "MS-CRAWL-0001",
      panoramaUrl: "https://makler-realty.com/tours/panorama-second.jpg",
      accessibilityCaption: "Second reviewed 360 panorama.",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
    "2026-07-05T00:01:00Z",
  );

  assert.equal(assertTourApprovals([first, second]), true);
  assert.equal(latestTourForListing([first, second], "MS-CRAWL-0001").panorama_url, "https://makler-realty.com/tours/panorama-second.jpg");
  assert.equal(
    latestTourForListing([{ ...second, panorama_url: "https://cdn.example.test/panorama-second.jpg" }, first], "MS-CRAWL-0001").id,
    first.id,
  );
  assert.throws(
    () =>
      createTourApproval(seed, {
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://makler-realty.com/tours/panorama.jpg",
        accessibilityCaption: "Reviewed 360 panorama.",
        reviewer: "media_editor",
      }),
    /explicit human confirmation/,
  );
  assert.throws(
    () =>
      createTourApproval(seed, {
        listingId: "missing",
        panoramaUrl: "https://makler-realty.com/tours/panorama.jpg",
        accessibilityCaption: "Reviewed 360 panorama.",
        reviewer: "media_editor",
      }),
    /Known listingId/,
  );

  const splat = createTourApproval(
    seed,
    {
      id: "tour-approval-splat",
      listingId: "MS-CRAWL-0001",
      provider: "supersplat-viewer",
      viewerUrl: "https://makler-realty.com/splats/MS-CRAWL-0001/",
      accessibilityCaption: "Reviewed interactive 3D reconstruction of the property interior.",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
    "2026-07-05T00:02:00Z",
  );
  assert.equal(splat.provider, "supersplat-viewer");
  assert.equal(splat.viewer_url, "https://makler-realty.com/splats/MS-CRAWL-0001/");
});
