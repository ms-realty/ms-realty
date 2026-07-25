import test from "node:test";
import assert from "node:assert/strict";
import { renderAppRoute } from "../lib/app-router-adapter.mjs";

// The App Router adapter enables the Next image optimizer at module load.

test("listing page emits responsive optimizer markup for legacy media", () => {
  const { html, status } = renderAppRoute({ pathname: "/bg/imoti/MS-CRAWL-0001", host: "makler-realty.com" });
  assert.equal(status, 200);

  const optimized = [...html.matchAll(/<img[^>]+srcset="([^"]+)"[^>]*>/g)];
  assert.ok(optimized.length >= 10, "gallery renders optimizer srcsets");

  const first = optimized[0][0];
  assert.match(first, /src="\/_next\/image\?url=https%3A%2F%2Fmakler-realty\.com%2Fwp-content%2Fuploads%2F[^&]+&amp;w=828&amp;q=70"/);
  assert.match(optimized[0][1], /384w/);
  assert.match(optimized[0][1], /1920w/);
  assert.match(first, /sizes="/);
  assert.match(first, /data-original-src="https:\/\/makler-realty\.com\/wp-content\/uploads\//);
  assert.match(first, /alt="[^"]+"/);
});

test("hero image keeps eager loading and high fetch priority with srcset", () => {
  const { html } = renderAppRoute({ pathname: "/bg/imoti/MS-CRAWL-0001", host: "makler-realty.com" });
  const hero = html.match(/<img[^>]+fetchPriority="high"[^>]*>/);
  assert.ok(hero, "hero image present");
  assert.match(hero[0], /loading="eager"/);
  assert.match(hero[0], /srcset="[^"]*828w[^"]*"/);
  assert.match(hero[0], /sizes="\(max-width: 640px\) 100vw, 66vw"/);
});

test("search cards render sized optimizer variants", () => {
  const { html } = renderAppRoute({ pathname: "/bg", host: "makler-realty.com" });
  const cardImg = html.match(/<img[^>]+sizes="\(max-width: 640px\) 100vw, \(max-width: 1100px\) 50vw, 33vw"[^>]*>/);
  assert.ok(cardImg, "property card uses the card sizes contract");
  assert.match(cardImg[0], /srcset="\/_next\/image\?url=/);
});

test("non-legacy images are not routed through the optimizer", () => {
  const { html } = renderAppRoute({ pathname: "/bg", host: "makler-realty.com" });
  const dataImages = [...html.matchAll(/<img[^>]+src="data:image[^>]+>/g)];
  assert.ok(dataImages.length >= 1, "inline data images still render");
  for (const [tag] of dataImages) assert.ok(!tag.includes("srcset="), "data images keep plain src");
});
