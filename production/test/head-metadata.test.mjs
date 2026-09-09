import test from "node:test";
import assert from "node:assert/strict";
import { findListingById, loadListings } from "../lib/content.mjs";
import { assertHtmlPage, renderHtmlPage } from "../lib/html.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { absolutePublicUrl, publicOrigin } from "../lib/public-origin.mjs";
import { renderHomePage, renderListingPage, renderSearchPage } from "../lib/public-site.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { buildRuntimeLocalizedSitemap, renderSitemapXml } from "../lib/seo-files.mjs";
import { META_DESCRIPTION_LIMIT, metaDescription } from "../lib/seo.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const seed = loadCmsSeed();
const origin = publicOrigin();

function headOf(html) {
  return html.slice(0, html.indexOf("</head>"));
}

function metaContent(head, selector) {
  return new RegExp(`<meta ${selector} content="([^"]*)"`).exec(head)?.[1] ?? null;
}

function headUrls(head) {
  return [
    ...[...head.matchAll(/<link rel="(?:canonical|alternate)"[^>]*href="([^"]*)"/g)].map(([, value]) => value),
    ...[...head.matchAll(/<meta property="og:(?:url|image)" content="([^"]*)"/g)].map(([, value]) => value),
    ...[...head.matchAll(/<meta name="twitter:image" content="([^"]*)"/g)].map(([, value]) => value),
  ];
}

test("every head URL a crawler resolves is absolute, on every page type and locale", () => {
  const pages = [
    ["home bg", renderHomePage({ registry, listings, localeCode: "bg" })],
    ["home he", renderHomePage({ registry, listings, localeCode: "he" })],
    ["search bg", renderSearchPage({ registry, listings, localeCode: "bg", query: "Sandanski" })],
    ["listing bg", renderListingPage({ registry, listing: findListingById(listings, "MS-00815"), localeCode: "bg" })],
    ["guide en", renderRuntimePath(registry, seed, "/en/guides/foreign-buyers")],
    ["location bg", renderRuntimePath(registry, seed, "/bg/lokacii/sandanski")],
    ["seller bg", renderRuntimePath(registry, seed, "/bg/prodai")],
  ];

  for (const [label, page] of pages) {
    const head = headOf(renderHtmlPage(page));
    const urls = headUrls(head);
    assert.ok(urls.length > 0, `${label} must publish head URLs`);
    for (const url of urls) assert.match(url, /^https:\/\//, `${label} published a relative head URL: ${url}`);
    assert.equal(metaContent(head, 'property="og:url"'), absolutePublicUrl(page.canonical || page.path));
    assert.ok(head.includes(`<link rel="canonical" href="${absolutePublicUrl(page.canonical || page.path)}">`), label);
  }
});

test("the head and the sitemap advertise the same absolute URLs", () => {
  const sitemapXml = renderSitemapXml(buildRuntimeLocalizedSitemap(registry, seed, []), { origin });
  const locs = new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc));

  for (const path of ["/bg", "/en", "/bg/imoti/MS-00815", "/en/guides/foreign-buyers"]) {
    const head = headOf(renderHtmlPage(renderRuntimePath(registry, seed, path)));
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(head)[1];
    assert.ok(locs.has(canonical), `sitemap must advertise the canonical the head publishes: ${canonical}`);
  }
});

test("the hreflang cluster is fully qualified so Google can group the seven languages", () => {
  const head = headOf(renderHtmlPage(renderHomePage({ registry, listings, localeCode: "bg" })));
  const alternates = [...head.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)];

  assert.equal(alternates.length, 8);
  for (const [, code, href] of alternates) assert.equal(href, absolutePublicUrl(`/${code === "x-default" ? "bg" : code}`));
  assert.ok(alternates.some(([, code]) => code === "x-default"));
});

test("share cards read a territory locale and a declared card type", () => {
  const homeHead = headOf(renderHtmlPage(renderHomePage({ registry, listings, localeCode: "bg" })));
  const listingHead = headOf(
    renderHtmlPage(renderListingPage({ registry, listing: findListingById(listings, "MS-00815"), localeCode: "bg" })),
  );

  assert.equal(metaContent(homeHead, 'property="og:locale"'), "bg_BG");
  assert.ok(homeHead.includes('<meta property="og:locale:alternate" content="en_US">'));
  assert.ok(homeHead.includes('<meta property="og:locale:alternate" content="he_IL">'));
  assert.equal(homeHead.includes('content="bg"'), false);

  // A large-image card is only honest where the page has an approved photo.
  assert.equal(metaContent(homeHead, 'name="twitter:card"'), "summary");
  assert.equal(metaContent(listingHead, 'name="twitter:card"'), "summary_large_image");
  assert.equal(metaContent(listingHead, 'name="twitter:image"'), metaContent(listingHead, 'property="og:image"'));
  assert.equal(metaContent(listingHead, 'name="twitter:title"'), metaContent(listingHead, 'property="og:title"'));
});

test("the page assertion refuses a head that goes back to relative URLs", () => {
  const page = renderHomePage({ registry, listings, localeCode: "bg" });
  const html = renderHtmlPage(page).replace(`href="${absolutePublicUrl("/bg")}"`, 'href="/bg"');

  assert.throws(() => assertHtmlPage(html, { lang: "bg", dir: "ltr", kind: "home" }), /absolute URLs/);
});

test("a listing snippet is a readable sentence, not the whole property description", () => {
  const listing = findListingById(listings, "MS-00815");
  const page = renderListingPage({ registry, listing, localeCode: "bg" });

  assert.ok(page.body.description.length > META_DESCRIPTION_LIMIT, "fixture must have a long body to truncate");
  assert.ok(page.metadata.description.length <= META_DESCRIPTION_LIMIT);
  assert.match(page.metadata.description, /…$/);
  assert.ok(page.body.description.startsWith(page.metadata.description.replace(/…$/, "")));
  // The body copy and the structured data keep the whole approved text.
  assert.equal(page.schema.description, page.body.description);
});

test("meta descriptions truncate on a word boundary in every script the site publishes", () => {
  assert.equal(metaDescription("Кратко описание."), "Кратко описание.");
  assert.equal(metaDescription("  spaced\n  out  "), "spaced out");

  for (const text of [
    `${"Апартаментът се намира в новопостроена сграда до градския парк в Сандански. ".repeat(4)}Край.`,
    `${"The apartment sits in a newly built block beside the town park in Sandanski. ".repeat(4)}End.`,
    `${"Το διαμέρισμα βρίσκεται σε νεόδμητη πολυκατοικία δίπλα στο πάρκο της πόλης. ".repeat(4)}Τέλος.`,
    `${"הדירה ממוקמת בבניין חדש ליד הפארק העירוני בסנדנסקי. ".repeat(6)}סוף.`,
  ]) {
    const snippet = metaDescription(text);
    assert.ok(snippet.length <= META_DESCRIPTION_LIMIT, snippet);
    assert.match(snippet, /…$/);
    // Word boundary: everything before the ellipsis is a prefix of the source,
    // and the source continues with a space or a punctuation mark rather than
    // with another letter, so no word is cut in half.
    const kept = snippet.replace(/…$/, "");
    assert.ok(text.startsWith(kept), snippet);
    assert.doesNotMatch(text[kept.length] ?? " ", /[\p{L}\p{N}]/u, snippet);
  }
});

test("a truncated snippet never ends on a dangling preposition or connector", () => {
  assert.equal(metaDescription("Апартамент в Сандански", { limit: 14 }), "Апартамент…");
  assert.equal(metaDescription("Apartment in a newly built block with parking", { limit: 24 }), "Apartment in a newly…");
  assert.equal(metaDescription("Non-EU buyers need a company structure such as an OOD", { limit: 44 }), "Non-EU buyers need a company structure…");
});
