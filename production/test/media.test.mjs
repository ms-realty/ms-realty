import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaAsset, publicMediaLibrary } from "../lib/media.mjs";

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

  assert.equal(library.gallery_count, 1);
  assert.equal(library.gallery[0].url, "https://makler-realty.com/wp-content/uploads/2025/04/front.jpg");
  assert.equal(library.floor_plans.length, 0);
  assert.equal(library.videos.length, 0);
  assert.equal(library.review.floor_plan_candidates, 1);
  assert.equal(library.review.video_candidates, 1);
  assert.equal(library.review.review_gated_assets, 3);
});
