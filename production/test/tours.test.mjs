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

test("360 tour field requires reviewed panorama, caption, and fallback before public display", () => {
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
        panoramaUrl: "https://cdn.example.test/panorama.jpg",
        isPublic: true,
        media,
      }),
    /accessibility_caption/,
  );

  const approved = createTourField({
    listingId: "MS-CRAWL-0001",
    panoramaUrl: "https://cdn.example.test/panorama.jpg",
    accessibilityCaption: "Reviewed 360 panorama of the property interior.",
    isPublic: true,
    media,
  });

  assert.equal(publicTour(approved).available, true);
  assert.equal(publicTour(approved).mount_target, "psv-listing-tour");
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
      panoramaUrl: "https://cdn.example.test/panorama-first.jpg",
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
      panoramaUrl: "https://cdn.example.test/panorama-second.jpg",
      accessibilityCaption: "Second reviewed 360 panorama.",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
    "2026-07-05T00:01:00Z",
  );

  assert.equal(assertTourApprovals([first, second]), true);
  assert.equal(latestTourForListing([first, second], "MS-CRAWL-0001").panorama_url, "https://cdn.example.test/panorama-second.jpg");
  assert.throws(
    () =>
      createTourApproval(seed, {
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://cdn.example.test/panorama.jpg",
        accessibilityCaption: "Reviewed 360 panorama.",
        reviewer: "media_editor",
      }),
    /explicit human confirmation/,
  );
  assert.throws(
    () =>
      createTourApproval(seed, {
        listingId: "missing",
        panoramaUrl: "https://cdn.example.test/panorama.jpg",
        accessibilityCaption: "Reviewed 360 panorama.",
        reviewer: "media_editor",
      }),
    /Known listingId/,
  );
});
