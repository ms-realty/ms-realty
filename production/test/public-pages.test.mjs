import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvedContentDocumentsForPath, readApprovedCmsContent } from "../lib/approved-content.mjs";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  labelsFor,
  renderContactPage,
  renderGuidePage,
  renderHomePage,
  renderLanguageFallback,
  renderLegacyArchivePage,
  renderListingPreservationPage,
  renderNotFoundPage,
  renderSearchUnavailablePage,
  renderSellerPage,
} from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const seed = loadCmsSeed();
const pagesCss = readFileSync(new URL("../lib/ui/adapter-public-pages.css", import.meta.url), "utf8");
const vendorCss = readFileSync(new URL("../../public/vendor/ms-realty-public.css", import.meta.url), "utf8");
const PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];
const NEW_KEYS = [
  "browseByArea", "howBuyingWorks", "buyingStepOneTitle", "buyingStepOneText", "buyingStepTwoTitle", "buyingStepTwoText",
  "buyingStepThreeTitle", "buyingStepThreeText", "startSearch", "trustReviewed", "trustLanguages", "trustOffices",
  "whatHappensNext", "sellerNextOneTitle", "sellerNextOneText", "sellerNextTwoTitle", "sellerNextTwoText",
  "sellerNextThreeTitle", "sellerNextThreeText", "sellerPromise", "stepOf", "sellerStepOneQuestion",
  "sellerStepTwoQuestion", "sellerStepThreeQuestion", "contactFormTitle", "contactTopic", "topicBuying", "topicRenting",
  "topicSelling", "topicOther", "callOrMessage", "ourOffices", "openMap", "propertiesIn", "onThisPage", "askBroker",
  "askBrokerText", "relatedGuides", "notFoundTitle", "notFoundText", "goHome",
];

function guide(path) {
  return renderGuidePage({ registry, localeCode: path.split("/")[1], path, documents: approvedContentDocumentsForPath(readApprovedCmsContent(), path) });
}

test("every new public page label exists in all seven locales without dashes or exclamation marks", () => {
  for (const code of PUBLIC_LOCALES) {
    const labels = labelsFor(code);
    for (const key of NEW_KEYS) {
      assert.equal(typeof labels[key], "string", `${code}.${key}`);
      assert.ok(labels[key].trim().length > 1, `${code}.${key}`);
      assert.doesNotMatch(labels[key], /[—–!]/, `${code}.${key}`);
    }
    assert.match(labels.stepOf, /\{n\}[\s\S]*\{total\}/, `${code}.stepOf keeps both placeholders`);
    assert.match(labels.propertiesIn, /\{area\}/, `${code}.propertiesIn keeps the area placeholder`);
  }
  const unavailable = ["bg", "en", "de", "nl", "ru", "el", "he"].map((code) => renderSearchUnavailablePage({ registry, localeCode: code }).body.intro);
  for (const text of unavailable) assert.doesNotMatch(text, /[—–]/);
  assert.doesNotMatch(renderSellerPage({ registry, localeCode: "bg", leadWritesDisabled: true }).body.form_unavailable, /[—–]/);
});

test("home keeps the hero and orders the sections: areas, how buying works, featured, guides, trust, sell", () => {
  for (const code of PUBLIC_LOCALES) {
    const page = renderHomePage({ registry, listings, localeCode: code });
    const html = renderReactPublicBody(page);
    assert.match(html, /data-hero-search="true"/, `${code} hero search form`);
    const order = [
      html.indexOf('data-home-locations="true"'),
      html.indexOf('data-home-how-buying-works="true"'),
      html.indexOf('data-featured-listings="true"'),
      html.indexOf('data-home-guides="true"'),
      html.indexOf('data-home-trust="true"'),
      html.indexOf('class="hp-sell"'),
    ];
    assert.ok(order.every((index) => index > 0), `${code} sections present: ${order.join(",")}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${code} section order`);
    assert.equal(page.body.start.path, `/${code}/${registry.locales.find((locale) => locale.code === code).route_segments.start || "start"}`);
    assert.match(html, new RegExp(`href="${page.body.start.path}" data-action="start"`));
    assert.match(html, /class="flow-steps hp-how__steps"/);
    assert.equal((html.match(/class="flow-steps__item"/g) || []).length >= 3, true);
    assert.equal((html.match(/<ul class="hp-trust__in">[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 3);
    assert.match(html, new RegExp(labelsFor(code).trustOffices));
    assert.match(html, new RegExp(`${labelsFor(code).browseAllListings}`));
  }
  const en = renderReactPublicBody(renderHomePage({ registry, listings, localeCode: "en" }));
  assert.match(en, /<h2 id="hp-how-title">How buying works<\/h2>/);
  assert.match(en, /Tell us what you want/);
  assert.match(en, /Get a broker shortlist/);
  assert.match(en, /View and buy with local paperwork done/);
  assert.match(en, /Start your search/);
  assert.match(en, /class="hp-resort__c">\d+ reviewed listings</);
  assert.doesNotMatch(en, /hp-guide__icon/);
  // The agency runs one office, in Sandanski. The chrome must not name Bansko
  // or Sveti Vlas here: it sells property there, it has no office there.
  assert.match(en, /Local office: Sandanski</);
  assert.doesNotMatch(en.match(/<ul class="hp-trust__in">[\s\S]*?<\/ul>/)[0], /Bansko|Sveti Vlas/);
});

test("seller page keeps its intake contract and adds the promise, step questions, what happens next and channels", () => {
  const page = renderSellerPage({ registry, localeCode: "en", leadWritesDisabled: false });
  const html = renderReactPublicBody(page);
  assert.match(html, /data-seller-intake="true" data-seller-step="1"/);
  assert.match(html, /data-seller-promise="true"/);
  assert.match(html, /not an automated estimate/);
  assert.match(html, /<p class="sell-form__step">Step 1 of 3<\/p>/);
  assert.match(html, /<p class="sell-form__step">Step 3 of 3<\/p>/);
  assert.match(html, /data-seller-step-title="true">Tell us about your property</);
  assert.match(html, /data-seller-step-title="true">How can the broker reach you\?</);
  assert.match(html, /data-seller-next="true" hidden/, "Next ships hidden and is revealed by the stepper script");
  assert.match(html, /data-seller-back="true" hidden/);
  assert.match(html, /data-seller-next-steps="true"/);
  assert.match(html, /A local broker calls you back/);
  assert.match(html, /<section class="sell-channels"[^>]*data-contact-channels="true"/);
  for (const href of ["tel:+359879696870", "https://wa.me/359879696870", "viber://chat?number=%2B359879696870", "mailto:office@makler-realty.com"]) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
  const he = renderReactPublicBody(renderSellerPage({ registry, localeCode: "he", leadWritesDisabled: false }));
  assert.match(he, /שלב 1 מתוך 3/);
  const off = renderReactPublicBody(renderSellerPage({ registry, localeCode: "de", leadWritesDisabled: true }));
  assert.match(off, /data-form-unavailable="true"/);
  assert.doesNotMatch(off, /data-seller-intake/);
  assert.match(off, /data-seller-next-steps="true"/);
  // No submittable form means no progress indicator promising a stepper.
  assert.doesNotMatch(off, /data-seller-steps="true"/);
  assert.match(off, /href="tel:\+359879696870"/);
});

test("contact page lists the single Sandanski office as an object, channels, and a callback form with a topic select", () => {
  const page = renderContactPage({ registry, localeCode: "en", leadWritesDisabled: false });
  // The agency has one office, in Sandanski. Bansko and Sveti Vlas are places
  // it sells property, not places it has a branch.
  assert.deepEqual(page.body.offices.map((office) => office.location), ["Sandanski"]);
  assert.equal(page.body.offices[0].search_path, "/en/search?location=Sandanski");
  assert.match(page.body.offices[0].map_href, /^https:\/\/www\.openstreetmap\.org\/search\?query=Sandanski/);
  const html = renderReactPublicBody(page);
  assert.match(html, /data-contact-offices="true"/);
  assert.equal((html.match(/class="ct-office" data-office="/g) || []).length, 1);
  assert.match(html, /Properties in Sandanski/);
  assert.match(html, /href="https:\/\/www\.openstreetmap\.org\/search\?query=Sandanski%2C%20Bulgaria" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /Bansko|Sveti Vlas/, "the contact page must not claim an office in Bansko or Sveti Vlas");
  assert.match(html, /<select name="request_details.topic" data-contact-topic="true">/);
  for (const option of ["buying", "renting", "selling", "other"]) assert.match(html, new RegExp(`<option value="${option}">`));
  assert.match(html, /name="contact.phone" type="tel" required/);
  assert.match(html, /name="request_details.callback_time"/);
  assert.match(html, /website_contact_callback/);
  assert.match(html, /class="mk-btn mk-btn--accent mk-btn--lg" href="tel:\+359879696870"/);
  assert.doesNotMatch(html, /ct-office__ph/);
  const he = renderContactPage({ registry, localeCode: "he", leadWritesDisabled: false });
  assert.equal(he.body.offices[0].name, "סנדנסקי");
  assert.match(renderReactPublicBody(he), /נכסים ב-סנדנסקי/);
});

test("guide pages read as articles with a table of contents, sources, ask-a-broker and related guides", () => {
  const foreign = renderReactPublicBody(guide("/en/guides/foreign-buyers"));
  assert.match(foreign, /class="guide-page__in guide-page__in--toc"/);
  assert.match(foreign, /<nav class="guide-toc" aria-labelledby="guide-toc-title" data-guide-toc="true">/);
  assert.match(foreign, /href="#foreign-buyers-financing-gap">Foreign-buyer financing checks</);
  assert.match(foreign, /href="#guide-ask">Ask a broker</);
  assert.match(foreign, /href="#guide-related">Related guides</);
  assert.match(foreign, /data-primary-guide-section="true" aria-label="Foreign buyers and Bulgarian land ownership"/);
  assert.match(foreign, /<section id="guide-ask" class="guide-ask" aria-labelledby="guide-ask-title" data-guide-ask-broker="true">/);
  assert.match(foreign, /<nav class="pg-actions" aria-label="Guide actions">/);
  assert.match(foreign, /href="tel:\+359879696870"/);
  assert.match(foreign, /data-guide-related="true"/);
  const relatedSection = foreign.slice(foreign.indexOf('data-guide-related="true"'), foreign.indexOf("</article>"));
  assert.match(relatedSection, /href="\/en\/guides\/buying-process"/);
  assert.doesNotMatch(relatedSection, /href="\/en\/guides\/foreign-buyers"/, "the current guide is not related to itself");
  const sources = renderReactPublicBody(guide("/bg/guides/proverka-na-imot-sandanski"));
  assert.match(sources, /data-guide-sources="true"/);
  assert.match(sources, /https:\/\/kais\.cadastre\.bg\//);
  assert.match(pagesCss, /\.guide-page__in--toc \{ grid-template-columns: minmax\(0, 68ch\)/);
  assert.match(pagesCss, /\.guide-page__aside \{ grid-area: aside; position: sticky;/);
});

test("language fallback, search unavailable, legacy archive, listing preservation and 404 share the utility template", () => {
  const pages = [
    ["fallback", renderLanguageFallback({ registry, requestedLocale: "fr" })],
    ["unavailable", renderSearchUnavailablePage({ registry, localeCode: "he" })],
    ["archive", renderLegacyArchivePage({ registry, path: "/archive/x", entry: { extracted_body_text: "Текст.", source_url: "https://makler-realty.com/old", source_domain: "makler-realty.com", source_type: "page", captured_at_utc: "2025-11-02T10:00:00Z", text_sha256: "abc" } })],
    ["preserved", renderListingPreservationPage({ registry, path: "/x", entry: { id: "MS-LEGACY-0042", checked_at: "2026-06-01", catalog_state: "archived", source_locale: "bg" } })],
    ["not-found", renderNotFoundPage({ registry, path: "/de/nope" })],
  ];
  for (const [label, page] of pages) {
    const html = renderReactPublicBody(page);
    assert.match(html, /<section class="mk-empty ut-card" data-utility-template="true" aria-labelledby="[a-z-]+-title">/, label);
    assert.match(html, /<h1 id="[a-z-]+-title" class="mk-empty__title">/, label);
    assert.match(html, /<div class="mk-empty__actions ut-card__actions">/, label);
    assert.match(html, /href="tel:\+359879696870"/, `${label} keeps the phone`);
    assert.match(html, /class="site-hd/, `${label} renders the site chrome`);
  }
  const fallback = renderReactPublicBody(pages[0][1]);
  assert.match(fallback, /data-request-language="true" data-success-message="Thank you\. We will let you know when this language is ready\."/);
  assert.match(fallback, /href="\/en\/search"/);
  const archive = renderReactPublicBody(pages[2][1]);
  assert.match(archive, /data-legacy-archive-source="true"/);
  assert.match(archive, /<p class="ut-card__meta">Неиндексиран архив<\/p>/);
  assert.match(archive, /rel="nofollow noopener noreferrer"/);
  const preserved = renderReactPublicBody(pages[3][1]);
  assert.match(preserved, /data-catalog-state="archived"/);
  assert.match(preserved, /data-preservation-facts="true"/);
});

test("unknown paths render a branded localized 404 that stays kind not_found", () => {
  const page = renderRuntimePath(registry, seed, "/de/does-not-exist");
  assert.equal(page.kind, "not_found");
  assert.equal(page.status, 404);
  assert.equal(page.indexable, false);
  assert.equal(page.locale, "de");
  assert.equal(page.metadata.robots, "noindex,follow");
  assert.ok(page.chrome, "404 carries the site chrome");
  const html = renderReactPublicBody(page);
  assert.match(html, /data-kind="not-found"/);
  assert.match(html, /Diese Seite konnten wir nicht finden/);
  assert.match(html, /href="\/de\/suche"/);
  assert.match(html, /href="\/de"/);
  const guideMissing = renderGuidePage({ registry, localeCode: "en", path: "/en/guides/nope", documents: [] });
  assert.equal(guideMissing.status, 404);
  assert.ok(guideMissing.chrome);
  const bare = renderNotFoundPage({ registry, path: "/wp-content/old" });
  assert.equal(bare.locale, "en");
  assert.equal(renderNotFoundPage({ registry, path: "/fr/page" }).locale, "en");
  assert.equal(renderNotFoundPage({ registry, path: "/he/page" }).dir, "rtl");
});

test("client script enhances the guide table of contents and reveals the seller stepper controls", () => {
  assert.match(PUBLIC_APP_JS, /function initGuideToc\(\)/);
  assert.match(PUBLIC_APP_JS, /document\.querySelector\("\[data-guide-toc\]"\)/);
  assert.match(PUBLIC_APP_JS, /setAttribute\("aria-current", "location"\)/);
  assert.match(PUBLIC_APP_JS, /function initSellerStepper\(\)/);
  assert.match(PUBLIC_APP_JS, /form\.setAttribute\("data-seller-stepper", "true"\)/);
  assert.match(PUBLIC_APP_JS, /initGuideToc\(\);\s+initSellerStepper\(\);\s+initSellerIntake\(\);/);
  assert.match(pagesCss, /\.sell-form__actions \.mk-btn\[hidden\] \{ display: none; \}/);
  assert.match(pagesCss, /form\[data-seller-stepper\] \.sell-form__section \{ padding-top: 0; border-top: 0; \}/);
});

test("home rails carry an empty state instead of disappearing", () => {
  // No reviewed inventory: the areas rail explains itself and still offers search.
  const empty = renderReactPublicBody(renderHomePage({ registry, listings: [], localeCode: "en" }));
  assert.match(empty, /data-home-locations="true" data-home-locations-empty="true"/);
  assert.match(empty, /There are no areas to browse yet\./);
  assert.match(empty, /data-featured-empty="true"/);

  // German has no approved guides: the rail says so and links the English ones.
  const german = renderHomePage({ registry, listings, localeCode: "de" });
  assert.equal(german.body.guides, null);
  assert.equal(german.body.guides_alternate.locale, "en");
  assert.ok(german.body.guides_alternate.links.length >= 2);
  const germanHtml = renderReactPublicBody(german);
  assert.match(germanHtml, /data-home-guides="true" data-home-guides-empty="true"/);
  assert.match(germanHtml, /Ratgeber für Käufer sind in dieser Sprache noch nicht verfügbar\./);
  assert.match(germanHtml, /href="\/en\/guides\/foreign-buyers" lang="en" hrefLang="en"/);
  assert.match(germanHtml, /Auf Englisch lesen/);

  // English has guides, so it keeps the real rail.
  const english = renderReactPublicBody(renderHomePage({ registry, listings, localeCode: "en" }));
  assert.match(english, /data-home-guides="true" data-approved-source="cms"/);
  assert.doesNotMatch(english, /data-home-guides-empty/);
});

test("lead forms offer an optional email and the seller flow offers a working photo upload", () => {
  const seller = renderReactPublicBody(renderSellerPage({ registry, localeCode: "en", leadWritesDisabled: false }));
  assert.match(seller, /<label>Email \(optional\)<input name="contact.email" type="email" autocomplete="email" inputmode="email">/);
  // The control is live, and the upload is a real multipart form that works
  // without JavaScript.
  assert.match(seller, /data-feature-ready="photo_upload"/);
  assert.doesNotMatch(seller, /data-feature-pending="photo_upload"/);
  // Exactly ONE place on the page adds photos. The page used to carry two -
  // a link in the stepper jumping down to a second, differently styled block
  // under its own "Add photos" heading - which read as the same task offered
  // twice. The returning seller who already holds an enquiry reference is the
  // only case the stepper could not serve, so that field folded into this one
  // upload as a disclosure instead of justifying a whole second form.
  assert.equal(seller.match(/ct-form__title">Add photos</g)?.length, 1);
  assert.match(seller, /<details class="sell-photos__reference"/);
  assert.match(seller, /<form class="sell-photos__form" method="POST" action="\/api\/seller-photos\?return=[^"]+" enctype="multipart\/form-data"/);
  assert.match(seller, /<input type="file" name="photo" multiple required accept="image\/jpeg,image\/png,image\/webp,image\/avif"/);
  assert.match(seller, /data-seller-photo-progress="true"/);
  assert.match(seller, /data-seller-photo-status="true"/);
  assert.match(seller, /data-seller-photo-results="true"/);
  assert.match(seller, /never published automatically and never appear in search/);
  assert.match(seller, /data-seller-photos-searchable="false"/);

  // Switched off, the control ships visibly disabled with the reason next to it
  // rather than as a missing affordance.
  const withoutUpload = renderReactPublicBody(
    renderSellerPage({ registry, localeCode: "en", leadWritesDisabled: false, photoUploadDisabled: true }),
  );
  assert.match(withoutUpload, /data-feature-pending="photo_upload"/);
  assert.match(withoutUpload, /<button type="button" class="mk-btn mk-btn--secondary mk-btn--md" disabled aria-describedby="seller-photos-note">/);
  assert.match(withoutUpload, /<p id="seller-photos-note" class="sell-form__pending-note">Photo upload is not available yet\.<\/p>/);

  const contact = renderReactPublicBody(renderContactPage({ registry, localeCode: "de", leadWritesDisabled: false }));
  assert.match(contact, /name="contact.email" type="email"/);
  assert.match(contact, /E-Mail \(optional\)/);
  for (const code of PUBLIC_LOCALES) {
    for (const key of ["emailOptional", "addPhotos", "photosUnavailable", "guidesUnavailable", "guidesInEnglish", "areasEmpty"]) {
      assert.equal(typeof labelsFor(code)[key], "string", `${code}.${key}`);
      assert.doesNotMatch(labelsFor(code)[key], /[—–!]/, `${code}.${key}`);
    }
  }
});

test("the 404 page carries a working search form that needs no JavaScript", () => {
  const html = renderReactPublicBody(renderNotFoundPage({ registry, path: "/bg/nyama" }));
  assert.match(html, /<form class="ut-search" method="get" action="\/bg\/tarsene" role="search"/);
  assert.match(html, /data-not-found-search="true"/);
  assert.match(html, /<input id="not-found-query" name="q" type="search"/);
  assert.match(html, /<label for="not-found-query">/);
  const he = renderReactPublicBody(renderNotFoundPage({ registry, path: "/he/x" }));
  assert.match(he, /action="\/he\/search"/);
});

test("interactive parts of the new pages declare hover, focus, disabled and current states", () => {
  const states = [
    /\.hp-resort:hover \{/,
    /\.hp-resort:focus-visible \{ outline: none; box-shadow: var\(--shadow-focus\)/,
    /\.hp-guide:hover \{/,
    /\.hp-guide:focus-visible \{/,
    /\.ct-office__links a:hover \{/,
    /\.ct-office__links a:focus-visible \{/,
    /\.guide-toc a:hover \{/,
    /\.guide-toc a:focus-visible \{/,
    /\.guide-toc a\[aria-current="location"\] \{/,
    /\.guide-related a:hover \{/,
    /\.guide-related a:focus-visible \{/,
    /\.ct-form \[data-enquiry-error\] \{/,
    /\.ct-form \.mk-btn\[data-loading\] \{/,
    /\.ct-form :disabled \{/,
    /\.sell-form__pending \.mk-btn:disabled \{/,
    /\.hp-rail-empty,\n\.hp-featured \[data-featured-empty\] \{/,
    /\.sell-steps li\[aria-current="step"\] \{/,
    /\.sell-steps li\[data-complete="true"\] \{/,
  ];
  for (const pattern of states) assert.match(pagesCss, pattern, String(pattern));
});

test("the public stylesheet carries no admin CRM chrome", () => {
  // The two surfaces shared one render-blocking stylesheet, so every public
  // visitor downloaded and parsed the whole admin CRM design system before the
  // page could paint. The public bundle now stops at the shared tokens,
  // components and shell.
  const adminCss = readFileSync(new URL("../../public/vendor/ms-realty-admin.css", import.meta.url), "utf8");
  for (const selector of [".crm-sb__brand", ".crm-nav", ".crm-app", ".adm-account-form"]) {
    assert.ok(adminCss.includes(selector), `${selector} belongs to the admin bundle`);
    assert.ok(!vendorCss.includes(selector), `${selector} must not ship to public visitors`);
  }
  assert.doesNotMatch(vendorCss, /\.crm-/, "no admin CRM selector reaches the public bundle");
  // Both keep the shared layers they each depend on.
  for (const shared of ["--font-sans", ".mk-btn", ".skip-link"]) {
    assert.ok(vendorCss.includes(shared), `${shared} stays in the public bundle`);
    assert.ok(adminCss.includes(shared), `${shared} stays in the admin bundle`);
  }
  assert.ok(vendorCss.length < 260_000, `public bundle is ${vendorCss.length} bytes`);
});

test("the page styles are part of the built design bundle and use logical properties for RTL", () => {
  for (const selector of [".flow-steps__item", ".hp-trust__in", ".ut-card", ".ct-office", ".guide-toc", ".sell-steps__num"]) {
    assert.ok(vendorCss.includes(selector), `${selector} is built into public/vendor/ms-realty-public.css`);
  }
  assert.match(pagesCss, /\[dir="rtl"\] \.ico-dir \{ transform: scaleX\(-1\); \}/);
  // A phone number must not be reordered by a right-to-left paragraph.
  assert.match(pagesCss, /\[dir="rtl"\] a\[href\^="tel:"\]:not\(\.mk-btn\),/);
  assert.match(pagesCss, /\[dir="rtl"\] a\[href\^="tel:"\]\.mk-btn > span,/);
  assert.match(pagesCss, /direction: ltr;\n  unicode-bidi: isolate;/);
  assert.doesNotMatch(pagesCss, /(?<![a-z-])(margin|padding)-(left|right):/, "logical properties only");
  assert.doesNotMatch(pagesCss, /#[0-9a-fA-F]{3,6}\b/, "tokens only, no raw hex");
});
