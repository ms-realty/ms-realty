import test from "node:test";
import assert from "node:assert/strict";
import { publicImageOptimizerSource, responsivePublicImageProps } from "../lib/public-images.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { renderListingPage, renderSearchPage } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";

const mirror = "/media/makler-realty.com/wp-content/uploads/2025/08/907-dron-1-680x383.jpg";
const source = `https://makler-realty.com${mirror}`;

test("responsive candidates use the public mirror without changing the source record", () => {
  const image = Object.freeze({ url: `https://ms-realty.ms-realty-bg.workers.dev${mirror}`, alt: "Approved photo" });
  const props = responsivePublicImageProps(image.url, "440px");
  assert.equal(publicImageOptimizerSource(image.url), source);
  assert.equal(props.sizes, "440px");
  assert.equal(props.src, undefined);
  for (const candidate of props.srcSet.split(", ")) {
    const [url, descriptor] = candidate.split(" ");
    const parsed = new URL(url, "https://makler-realty.com");
    assert.equal(parsed.pathname, "/_next/image");
    assert.equal(parsed.searchParams.get("url"), source);
    assert.equal(parsed.searchParams.get("q"), "75");
    assert.equal(descriptor, `${parsed.searchParams.get("w")}w`);
  }
  assert.equal(image.url, `https://ms-realty.ms-realty-bg.workers.dev${mirror}`);
});

test("only known public photos enter the optimizer; private and unrecognized assets retain their existing delivery", () => {
  for (const url of [
    "https://other.test/media/makler-realty.com/wp-content/uploads/photo.jpg",
    "https://makler-realty.com/wp-content/private/photo.jpg",
    "https://makler-realty.com/media/other.test/wp-content/uploads/photo.jpg",
    `${source}?token=private`, `${source}#private`,
    source.replace("https://", "http://"),
    source.replace("https://", "https://user:password@"),
    "https://127.0.0.1/private.jpg", "data:image/png;base64,AA==", "/hero/../private.jpg",
  ]) {
    assert.equal(publicImageOptimizerSource(url), null, url);
    assert.deepEqual(responsivePublicImageProps(url, "440px"), {});
  }
});

test("small hero renditions retain the existing full-size AVIF and photograph", () => {
  const src = "/hero/sandanski-town-1280.avif";
  const props = responsivePublicImageProps(src, "520px", { widths: [384, 640, 750, 828], originalWidth: 1280 });
  assert.ok(props.srcSet.endsWith(`${src} 1280w`));
  assert.equal(publicImageOptimizerSource(src), src);
  assert.doesNotMatch(props.srcSet, /sandanski-640/);
});

test("rendered cards retain their original src, priority and source facts while the gallery viewer retains full originals", () => {
  const registry = loadLocaleRegistry();
  const listings = loadListings();
  const search = renderSearchPage({ registry, listings, localeCode: "en" });
  const sourceBefore = structuredClone(search.cards[0].thumbnail);
  const html = renderReactPublicBody(search);
  const cardImage = html.match(/<img [^>]*srcSet="[^"]+"[^>]*>/i)?.[0];
  assert.ok(cardImage);
  assert.ok(cardImage.includes(`src="${sourceBefore.url}"`));
  assert.match(cardImage, /loading="eager"/);
  assert.match(cardImage, /fetchPriority="high"/);
  assert.deepEqual(search.cards[0].thumbnail, sourceBefore);
  const listing = renderListingPage({ registry, listing: findListingById(listings, "MS-00907"), localeCode: "en" });
  const listingHtml = renderReactPublicBody(listing);
  const viewer = listingHtml.match(/<img [^>]*data-listing-gallery-image="true"[^>]*>/)?.[0];
  assert.ok(viewer);
  assert.doesNotMatch(viewer, /srcSet=/i);
  assert.ok(viewer.includes(`src="${listing.body.media.gallery[0].url}"`));
});
