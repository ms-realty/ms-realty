import test from "node:test";
import assert from "node:assert/strict";
import { mediaWorkflow, normalizeMediaAsset, publicMediaLibrary } from "../lib/media.mjs";

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
