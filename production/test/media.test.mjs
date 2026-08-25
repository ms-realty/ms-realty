import test from "node:test";
import assert from "node:assert/strict";
import { mediaWorkflow, normalizeMediaAsset, publicMediaLibrary, selectPublicThumbnail } from "../lib/media.mjs";

test("media library exposes imported photos and gates plans or videos for review", () => {
  const media = [
    normalizeMediaAsset({ image_url: "https://makler-realty.com/wp-content/themes/Avenue/images/logo.png", alt: "logo" }),
    normalizeMediaAsset({
      image_url:
        "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php?src=https://makler-realty.com/wp-content/uploads/2025/04/front.jpg&h=45&w=45&zc=1",
      alt: "Front view",
    }),
    normalizeMediaAsset({ image_url: "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg", alt: "Duplicate" }),
    normalizeMediaAsset({ image_url: "https://makler-realty.com/wp-content/uploads/2019/08/схема-72x72.jpg", alt: "Схема" }),
    normalizeMediaAsset({ image_url: "https://cdn.example.test/walkthrough.mp4", alt: "Walkthrough video" }),
  ];

  const library = publicMediaLibrary(media);

  assert.equal(media[0].kind, "site_chrome");
  assert.equal(media[0].review_status, "reviewed_private");
  assert.equal(library.gallery_count, 1);
  assert.equal(mediaWorkflow(media).public_gallery_assets, 1);
  assert.equal(library.gallery[0].url, "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg");
  assert.equal(library.floor_plans.length, 0);
  assert.equal(library.videos.length, 0);
  assert.equal(library.review.floor_plan_candidates, 1);
  assert.equal(library.review.video_candidates, 1);
  assert.equal(library.review.review_gated_assets, 2);
});

test("reviewed private media no longer blocks media review", () => {
  const library = publicMediaLibrary([
    { kind: "floor_plan", is_public: false, review_status: "reviewed_private" },
    { kind: "video", is_public: false, review_status: "reviewed_private" },
  ]);

  assert.equal(library.review.review_gated_assets, 0);
});

test("only individually human-approved plans and videos reach public media", () => {
  const library = publicMediaLibrary([
    {
      asset_url: "https://cdn.example.test/floor-plan.webp",
      alt: "Reviewed floor plan",
      kind: "floor_plan",
      is_public: true,
      review_status: "approved_by_human",
      media_reviewer: "media_editor",
    },
    {
      asset_url: "https://cdn.example.test/walkthrough.mp4",
      alt: "Accessible walkthrough caption",
      kind: "video",
      is_public: true,
      review_status: "approved_by_human",
      media_reviewer: "media_editor",
    },
    {
      asset_url: "https://cdn.example.test/unreviewed.mp4",
      alt: "Unreviewed video",
      kind: "video",
      is_public: true,
      review_status: "needs_media_review",
    },
  ]);

  assert.equal(library.floor_plans.length, 1);
  assert.equal(library.videos.length, 1);
  assert.equal(library.videos[0].url, "https://cdn.example.test/walkthrough.mp4");
});

test("imported public photos use listing fallback alt text", () => {
  const photo = normalizeMediaAsset(
    { image_url: "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg", alt: "" },
    { fallbackAlt: "Reviewed listing title" },
  );
  const floorPlan = normalizeMediaAsset(
    { image_url: "https://makler-realty.com/wp-content/uploads/2025/04/floor-plan.jpg", alt: "" },
    { fallbackAlt: "Reviewed listing title" },
  );

  assert.equal(photo.alt, "Reviewed listing title");
  assert.equal(floorPlan.alt, "");
});

test("large source imagery outranks an inherited 45px homepage thumbnail", () => {
  const media = [
    normalizeMediaAsset({
      image_url:
        "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php?src=https://makler-realty.com/wp-content/uploads/2025/04/DJI_0696-680x383.jpg&h=45&w=45&zc=1",
      alt: "Inherited small preview",
    }, { width: 45, height: 45 }),
    normalizeMediaAsset({
      image_url:
        "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php?src=https://makler-realty.com/wp-content/uploads/2024/10/1729152754532-680x510.jpg&h=600&w=1000&zc=1",
      alt: "Listing exterior",
    }),
  ];

  const thumbnail = selectPublicThumbnail(media);
  const gallery = publicMediaLibrary(media);

  assert.equal(thumbnail.url, "https://makler-realty.com/wp-content/uploads/2024/10/1729152754532-680x510.jpg");
  assert.equal(gallery.gallery[0].url, thumbnail.url);
  assert.equal(gallery.gallery.length, 1);
});

test("a sidebar-widget thumbnail of another property is never a listing's only photo", () => {
  const media = [
    normalizeMediaAsset(
      {
        image_url:
          "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php?src=https://makler-realty.com/wp-content/uploads/2025/04/DJI_0696-680x383.jpg&h=45&w=45&zc=1",
        alt: "Recently added listing",
      },
      { width: 45, height: 45 },
    ),
  ];

  const library = publicMediaLibrary(media);

  assert.equal(library.gallery_count, 0);
  assert.equal(selectPublicThumbnail(media), null);
});

test("WordPress thumbnail derivatives recover originals without exposing tiny public fallbacks", () => {
  const media = [
    normalizeMediaAsset(
      { image_url: "https://makler-realty.ru/wp-content/uploads/2013/11/191-2-72x72.jpg", alt: "Living room" },
      { width: 72, height: 72 },
    ),
    normalizeMediaAsset(
      { image_url: "https://makler-realty.ru/wp-content/uploads/2013/11/191-3-72x72.jpg", alt: "Bedroom" },
      { width: 72, height: 72 },
    ),
  ];

  const gallery = publicMediaLibrary(media);

  assert.equal(gallery.gallery_count, 2);
  assert.equal(gallery.review.public_gallery_assets, 2);
  assert.equal(gallery.review.suppressed_public_assets, 0);
  assert.equal(gallery.gallery[0].url, "https://makler-realty.ru/wp-content/uploads/2013/11/191-2.jpg");
  assert.equal(gallery.gallery[0].fallback_url, undefined);
  assert.equal(media[0].width, null);
  assert.equal(media[0].height, null);
});
