import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { assertLocaleRegistry, loadLocaleRegistry, publicIndexableLocales } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import {
  listingExtras,
  renderAboutPage,
  renderAlertsPage,
  renderComparePage,
  renderContactPage,
  renderListingPage,
  teamProfilesPayload,
} from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { renderHtmlPage, assertHtmlPage } from "../lib/html.mjs";
import { absolutePublicUrl } from "../lib/public-origin.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { aboutPath, alertsPath, comparePath, hreflangForAbout } from "../lib/seo.mjs";
import { buildAppRouteManifest } from "../lib/app-route-manifest.mjs";
import { SAVED_SEARCH_FREQUENCIES, SAVED_SEARCH_MANAGE_ACTIONS } from "../lib/saved-search-manage.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-public-extra-payload-secret-32-characters",
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-public-extra-contact-key-32-characters",
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
});

const registry = loadLocaleRegistry();
const listings = loadListings();
const seed = loadCmsSeed();
const css = fs.readFileSync(fromRoot("production", "lib", "ui", "adapter-public-extra.css"), "utf8");
const PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];
// Four active crawl listings that differ on price, bedrooms and location.
const COMPARE_IDS = ["MS-00911", "MS-00803", "MS-00895", "MS-00567-1"];

function compare(localeCode, ids = COMPARE_IDS) {
  return renderComparePage({
    registry,
    localeCode,
    listings,
    searchParams: ids.length ? new URLSearchParams(`ids=${ids.join(",")}`) : null,
  });
}

test("every public locale routes its own compare, about and alerts segment", () => {
  assert.equal(assertLocaleRegistry(registry), true);
  assert.equal(comparePath(registry, "bg"), "/bg/sravnenie");
  assert.equal(comparePath(registry, "de"), "/de/vergleich");
  assert.equal(comparePath(registry, "nl"), "/nl/vergelijken");
  assert.equal(comparePath(registry, "el"), "/el/sygkrisi");
  assert.equal(comparePath(registry, "he"), "/he/compare");
  assert.equal(aboutPath(registry, "bg"), "/bg/za-nas");
  assert.equal(aboutPath(registry, "ru"), "/ru/o-nas");
  assert.equal(alertsPath(registry, "bg"), "/bg/abonamenti");
  assert.equal(alertsPath(registry, "de"), "/de/benachrichtigungen");
  assert.equal(alertsPath(registry, "el"), "/el/eidopoiiseis");
  // About is a trust page, so it carries one alternate per indexable locale.
  assert.equal(hreflangForAbout(registry).length, publicIndexableLocales(registry).length + 1);
  assert.equal(hreflangForAbout(registry).at(-1).href, "/bg/za-nas");
});

test("the runtime resolves the three routes in every public locale and rejects a foreign slug", () => {
  for (const code of PUBLIC_LOCALES) {
    for (const [resolve, kind] of [
      [comparePath, "compare"],
      [aboutPath, "about"],
      [alertsPath, "alerts"],
    ]) {
      const page = renderRuntimePath(registry, seed, resolve(registry, code));
      assert.equal(page.kind, kind, `${code} must resolve ${kind}`);
      assert.equal(page.locale, code);
      assert.equal(page.status, 200);
      assert.equal(page.dir, code === "he" ? "rtl" : "ltr");
    }
  }
  assert.equal(renderRuntimePath(registry, seed, "/bg/compare").kind, "not_found");
  assert.equal(renderRuntimePath(registry, seed, "/en/za-nas").kind, "not_found");
});

test("the App Router manifest maps the three routes to the catch-all content route", () => {
  const manifest = buildAppRouteManifest({
    registry,
    sitemap: {
      entries: [
        { type: "compare", locale: "en", loc: "/en/compare", hreflang: [] },
        { type: "about", locale: "en", loc: "/en/about", hreflang: [{ hreflang: "en", href: "/en/about" }] },
        { type: "alerts", locale: "en", loc: "/en/alerts", hreflang: [] },
      ],
    },
    generatedAt: "2026-08-24T00:00:00Z",
  });
  assert.equal(manifest.routes.find((entry) => entry.path === "/en/compare").renderer, "renderComparePage");
  assert.equal(manifest.routes.find((entry) => entry.path === "/en/about").renderer, "renderAboutPage");
  assert.equal(manifest.routes.find((entry) => entry.path === "/en/alerts").renderer, "renderAlertsPage");
});

/* ---------------------------------------------------------------- compare */

test("the comparison renders one column per saved id, capped at four", () => {
  const page = compare("en", [...COMPARE_IDS, "MS-01000"]);
  assert.equal(page.kind, "compare");
  assert.equal(page.body.max_columns, 4);
  assert.equal(page.body.columns.length, 4);
  assert.equal(page.body.over_limit, 5);
  assert.equal(page.indexable, false);
  assert.equal(page.metadata.robots, "noindex,follow");
  assert.deepEqual(
    page.body.rows.map((row) => row.id),
    ["price", "price_per_sqm", "area_sqm", "land_area_sqm", "bedrooms", "floor", "offer_type", "location", "reference"],
  );
  for (const row of page.body.rows) assert.equal(row.values.length, 4, `${row.id} needs one value per column`);

  const html = renderReactPublicBody(page);
  assert.match(html, /data-react-public-ui="compare"/);
  assert.equal((html.match(/data-compare-column="MS-0\d{4}(?:-\d+)?"/g) || []).length, 4);
  assert.match(html, /data-compare-limit="true"/);
  assert.doesNotMatch(html, /data-compare-limit="true"[^>]*hidden/);
});

test("rows where every column matches collapse behind a disclosure that needs no JavaScript", () => {
  const page = compare("en");
  const identical = page.body.rows.filter((row) => row.identical);
  assert.ok(identical.length > 0, "the fixtures must produce at least one identical row");
  assert.equal(page.body.identical_count, identical.length);
  // Price and reference differ across these four, so they must stay visible.
  assert.equal(page.body.rows.find((row) => row.id === "price").identical, false);
  assert.equal(page.body.rows.find((row) => row.id === "reference").identical, false);

  const html = renderReactPublicBody(page);
  assert.match(html, /data-compare-identical="true"/);
  assert.match(html, /data-compare-identical-input="true"/);
  // The disclosure is a checkbox, so CSS alone opens it on a shared link.
  assert.match(css, /\.cmp-table tr\[data-compare-identical="true"\] \{ display: none; \}/);
  assert.match(css, /\.cmp:has\(\.cmp-identical__input:checked\) \.cmp-table tr\[data-compare-identical="true"\] \{ display: table-row; \}/);
});

test("a single column has nothing to collapse", () => {
  const page = compare("en", ["MS-00911"]);
  assert.equal(page.body.columns.length, 1);
  assert.equal(page.body.identical_count, 0);
  assert.equal(page.body.rows.every((row) => row.identical === false), true);
});

test("removing a column is a plain link, and an unknown id is counted, never rendered", () => {
  const page = compare("en", ["MS-00911", "MS-00803", "MS-CRAWL-NOPE"]);
  assert.equal(page.body.columns.length, 2);
  assert.equal(page.body.unavailable_count, 1);
  const html = renderReactPublicBody(page);
  assert.match(html, /data-compare-unavailable="true"/);
  assert.doesNotMatch(html, /data-compare-unavailable="true"[^>]*hidden/);
  // Without JavaScript the remove control still drops that column.
  assert.match(html, /href="\/en\/compare\?ids=MS-00803" data-compare-remove="MS-00911"/);
  assert.match(html, /href="\/en\/compare\?ids=MS-00911" data-compare-remove="MS-00803"/);
});

test("with no ids the page ships the saved-listings fallback rather than an empty table", () => {
  const page = compare("en", []);
  assert.equal(page.body.state, "empty");
  assert.equal(page.body.columns.length, 0);
  const html = renderReactPublicBody(page);
  // The fallback is visible by default and the client hides it.
  assert.match(html, /data-compare-fallback="true"/);
  assert.doesNotMatch(html, /data-compare-fallback="true"[^>]*hidden/);
  assert.match(html, /data-compare-empty="true"[^>]*hidden/);
  assert.match(html, /data-compare-region="true" hidden/);
  assert.match(html, /href="\/en\/search\?saved=1"/);
});

test("the saved counter in the header and the saved view both link into the comparison", () => {
  const page = compare("en");
  assert.equal(page.chrome.saved.href, "/en/search?saved=1");
  assert.equal(page.chrome.saved.compare.href, "/en/compare");
  const html = renderReactPublicBody(page);
  assert.match(html, /class="site-hd__saved"[^>]*data-saved-navigation="true"/);
  assert.match(html, /data-saved-count="true" hidden/);
  assert.match(html, /class="site-hd__compare"[^>]*data-compare-link="true" data-compare-min="2"[^>]*hidden/);
  assert.match(PUBLIC_APP_JS, /function syncCompareLinks\(\)/);
  assert.match(PUBLIC_APP_JS, /links\[i\]\.hidden = saved\.length < Number\(links\[i\]\.getAttribute\("data-compare-min"\) \|\| 2\);/);
});

test("the comparison scrolls inside its own container and keeps every control state", () => {
  assert.match(PUBLIC_APP_JS, /function initComparePage\(\)/);
  assert.match(PUBLIC_APP_JS, /function refreshCompare\(root, path\)/);
  assert.match(PUBLIC_APP_JS, /window\.location\.replace\(target\);/);
  assert.match(css, /\.cmp-scroll \{\n\s+overflow-x: auto;/);
  assert.match(css, /\.cmp \{ display: grid; grid-template-columns: minmax\(0, 1fr\); gap: var\(--space-3\); \}/);
  assert.match(css, /\.cmp-col__remove:hover \{/);
  assert.match(css, /\.cmp-col__remove:focus-visible \{/);
  assert.match(css, /\.cmp-col__remove:active \{/);
  assert.match(css, /\.cmp-col__remove\[aria-disabled="true"\] \{/);
  assert.match(css, /\.cmp-identical__input:focus-visible \+ \.cmp-identical__label \{/);
  assert.match(css, /\.cmp-identical__input:disabled \+ \.cmp-identical__label \{/);
});

/* -------------------------------------------------------- listing extras */

test("the listing carries an explicit brochure action naming the reference", () => {
  const listing = listings.find((entry) => entry.id === "MS-00803");
  const page = renderListingPage({ registry, listing, localeCode: "en" });
  const brochure = page.body.extras.brochure;
  assert.equal(brochure.url, "/en/properties/MS-00803?print=1");
  assert.equal(brochure.reference, "MS-00803");
  assert.equal(brochure.pdf_status, "browser_print_ready");

  const html = renderReactPublicBody(page);
  assert.match(html, /data-listing-brochure="true"/);
  assert.match(html, /data-listing-action="save_pdf"[^>]*data-listing-brochure-action="true"/);
  assert.match(html, /href="\/en\/properties\/MS-00803\?print=1"/);
  assert.match(html, /data-listing-brochure-reference="true">MS-00803</);
  // The print view itself is untouched and still renders without the design
  // system stylesheet.
  const print = renderHtmlPage(page, { print: true });
  assert.match(print, /data-print-status="browser-pdf-ready"/);
  assert.match(print, /MS-00803/);
});

test("the cost disclosure renders the approved fee table and refuses a total while a line is missing", () => {
  const listing = listings.find((entry) => entry.id === "MS-00803");
  const page = renderListingPage({ registry, listing, localeCode: "en" });
  const estimator = page.body.cost_estimator;
  assert.equal(estimator.available, false);
  assert.equal(estimator.reason, "incomplete_fee_table");
  assert.ok(estimator.missing.length > 0, "today every required line is unapproved");
  assert.equal(estimator.estimate.total_eur, null);

  const html = renderReactPublicBody(page);
  assert.match(html, /data-listing-costs="true" data-costs-available="false" data-costs-reason="incomplete_fee_table"/);
  assert.match(html, /data-costs-endpoint="\/api\/purchase-fees\/estimate"/);
  // Every blocking line is named, and no invented figure appears anywhere.
  for (const line of estimator.missing) {
    assert.match(html, new RegExp(`data-cost-line="${line.line_key}" data-cost-state="missing"`));
  }
  assert.match(html, /data-cost-total="unavailable"/);
  assert.match(html, /data-cost-total-unavailable="true"/);
  assert.doesNotMatch(html, /\[approved rate\]/);
});

test("renting carries none of the purchase fees, so the disclosure is a buy-only surface", () => {
  const rent = listings.find((entry) => entry.offer_type === "rent" || entry.facts?.offer_type === "rent");
  const locale = registry.locales.find((entry) => entry.code === "en");
  const sale = listingExtras({ registry, locale, view: { id: "X", offer_type: "sale" }, path: "/en/properties/x" });
  const let_ = listingExtras({ registry, locale, view: { id: "X", offer_type: "rent" }, path: "/en/properties/x" });
  assert.equal(sale.costs.applicable, true);
  assert.equal(let_.costs.applicable, false);
  if (rent) {
    const page = renderListingPage({ registry, listing: rent, localeCode: "en" });
    assert.equal(page.body.extras.costs.applicable, false);
    assert.doesNotMatch(renderReactPublicBody(page), /data-listing-costs="true"/);
  }
});

/* ------------------------------------------------------------ about page */

test("the about page states the single office and the five pillars from approved facts", () => {
  const page = renderAboutPage({ registry, localeCode: "en" });
  assert.equal(page.indexable, false);
  assert.equal(page.metadata.robots, "noindex,follow");
  // The agency runs one office, in Sandanski. Bansko and Sveti Vlas are places
  // it sells property, not places it has a branch.
  assert.deepEqual(page.body.offices.items.map((office) => office.id), ["sandanski"]);
  assert.deepEqual(page.body.pillars.items.map((pillar) => pillar.id), ["verified", "transparent", "fast", "multilingual", "local"]);
  const html = renderReactPublicBody(page);
  assert.match(html, /data-about-offices="true"/);
  assert.equal((html.match(/data-about-office="[a-z_]+"/g) || []).length, 1);
  assert.equal((html.match(/data-about-pillar="[a-z]+"/g) || []).length, 5);
  assert.doesNotMatch(html, /Bansko|Sveti Vlas/, "the about page must not claim an office in Bansko or Sveti Vlas");
  // Sandanski is inland, so its entry must carry no sea vocabulary in any
  // public locale, and no locale may name a second office.
  for (const code of PUBLIC_LOCALES) {
    const offices = renderAboutPage({ registry, localeCode: code }).body.offices.items;
    assert.equal(offices.length, 1, `${code} must show exactly one office`);
    const sandanski = offices.find((office) => office.id === "sandanski");
    const text = `${sandanski.town} ${sandanski.role} ${sandanski.note}`;
    assert.doesNotMatch(text, /sea|beach|coast|море|морск|плаж|meer|strand|küste|kust|θάλασσ|παραλ|ים |חוף/iu, `${code} must not sell Sandanski as a sea destination`);
    assert.ok(sandanski.note.length > 0, `${code} must describe the office`);
  }
});

test("the public truth scan separates service locations from office claims", () => {
  for (const code of PUBLIC_LOCALES) {
    const about = renderAboutPage({ registry, localeCode: code });
    const contact = renderContactPage({ registry, localeCode: code, leadWritesDisabled: true });
    const startSegment = registry.locales.find((locale) => locale.code === code).route_segments.start || "start";
    const start = renderRuntimePath(registry, seed, `/${code}/${startSegment}`);
    const officeClaims = JSON.stringify({
      about: about.body.offices,
      contact: contact.body.offices,
    });
    assert.deepEqual(about.body.offices.items.map((office) => office.id), ["sandanski"], `${code} about office list`);
    assert.deepEqual(contact.body.offices.map((office) => office.location), ["Sandanski"], `${code} contact office list`);
    assert.doesNotMatch(officeClaims, /bansko|sveti\s+vlas|банско|свети\s*влас/iu, `${code} office claims`);

    // These places remain valid service/property locations. The scan must not
    // ban their use in buyer guidance merely because they are not offices.
    assert.equal(start.body.areas.some((area) => area.id === "bansko"), true, `${code} Bansko service area`);
    assert.equal(start.body.areas.some((area) => area.id === "black_sea_coast"), true, `${code} coastal service area`);
  }
});

test("the team section reads the approved records and names the absence instead of inventing people", () => {
  const payload = teamProfilesPayload({ localeCode: "en" });
  assert.equal(payload.available, false, "no team profile is approved today");
  assert.ok(payload.notice, "an absence must carry a notice");

  const page = renderAboutPage({ registry, localeCode: "en" });
  assert.equal(page.body.team.available, false);
  assert.deepEqual(page.body.team.profiles, []);
  assert.equal(page.body.team.empty.title, payload.notice);
  assert.equal(page.body.team.empty.source, "approved_team_profiles");

  const html = renderReactPublicBody(page);
  assert.match(html, /data-about-team-available="false" data-about-team-count="0"/);
  assert.match(html, /data-about-team-empty="true" data-about-team-reason="[a-z_]+"/);
});

test("an approved profile renders, and a profile without an approved photo gets initials", () => {
  const page = renderAboutPage({
    registry,
    localeCode: "en",
    teamProfiles: {
      available: true,
      locale: "en",
      count: 2,
      profiles: [
        {
          profile_key: "maria",
          name: "Maria Ivanova",
          role: "Broker",
          office: "Sandanski",
          languages: ["Bulgarian", "English"],
          bio: "Covers the town and the Pirin foothills.",
          licence: { reference: "RE-1234", authority: "Registry", verified_at: "2026-01-01" },
          photo: null,
          photo_available: false,
        },
        {
          profile_key: "georgi",
          name: "Georgi Petrov",
          role: "Coast broker",
          office: "Sveti Vlas",
          languages: ["Bulgarian", "Russian"],
          bio: "",
          licence: null,
          photo: { url: "/vendor/example.png", alt: "Georgi Petrov" },
          photo_available: true,
        },
      ],
    },
  });
  assert.equal(page.body.team.available, true);
  assert.equal(page.body.team.empty, null);
  const html = renderReactPublicBody(page);
  assert.match(html, /data-about-team-available="true" data-about-team-count="2"/);
  // No approved photo means initials, never a borrowed face.
  assert.match(html, /data-about-team-photo="not_approved" aria-hidden="true">MI</);
  assert.match(html, /<img class="ab-member__photo" src="\/vendor\/example\.png"/);
  assert.match(html, /data-about-team-licence="true">RE-1234 · Registry</);
});

/* ----------------------------------------------------------- alerts page */

test("the alerts page carries the saved-search manage contract", () => {
  const page = renderAlertsPage({ registry, localeCode: "en" });
  assert.equal(page.indexable, false);
  assert.equal(page.metadata.robots, "noindex,follow");
  assert.equal(page.body.manage.endpoint, "/api/saved-searches/manage");
  assert.equal(page.body.manage.token_param, "token");
  assert.deepEqual(page.body.manage.actions, [...SAVED_SEARCH_MANAGE_ACTIONS]);
  assert.deepEqual(page.body.manage.frequencies, [...SAVED_SEARCH_FREQUENCIES]);
  assert.deepEqual(page.body.controls.map((control) => control.id), ["pause", "resume", "delete"]);

  const html = renderReactPublicBody(page);
  assert.match(html, /data-alerts-manage-endpoint="\/api\/saved-searches\/manage" data-alerts-token-param="token"/);
  // The managed record and the refusal are both first-class states.
  assert.match(html, /data-alerts-managed="true" hidden/);
  assert.match(html, /data-alerts-link-invalid="true" hidden/);
  assert.match(html, /data-alert-action="pause"/);
  assert.match(html, /data-alert-action="resume"/);
  assert.match(html, /data-alert-action="delete" data-alert-confirm=/);
  assert.match(html, /data-alert-frequency-select="true"/);
});

test("searches this browser recorded stay disabled and say why", () => {
  const page = renderAlertsPage({ registry, localeCode: "en" });
  const html = renderReactPublicBody(page);
  const template = html.slice(html.indexOf("<template"), html.indexOf("</template>"));
  assert.match(template, /data-alert-control="pause"/);
  assert.match(template, /disabled aria-disabled="true" aria-describedby="alerts-controls-note"/);
  assert.match(html, /id="alerts-controls-note"/);
  // The local list never keeps a contact detail.
  assert.match(PUBLIC_APP_JS, /function recordSavedSearch\(form\)/);
  assert.doesNotMatch(PUBLIC_APP_JS, /records\.unshift\(\{[^}]*contact\./);
  assert.match(PUBLIC_APP_JS, /function initAlertsManage\(root\)/);
  assert.match(PUBLIC_APP_JS, /if \(response\.status === 404\) throw new Error\("refused"\);/);
});

test("the alert list falls back to a server-rendered explanation without JavaScript", () => {
  const page = renderAlertsPage({ registry, localeCode: "en" });
  const html = renderReactPublicBody(page);
  assert.match(html, /data-alerts-fallback="true"/);
  assert.doesNotMatch(html, /data-alerts-fallback="true"[^>]*hidden/);
  assert.match(html, /data-alerts-region="true" hidden/);
  assert.match(html, /data-alerts-empty="true"[^>]*hidden/);
  assert.match(PUBLIC_APP_JS, /if \(fallback\) fallback\.hidden = true;/);
});

/* ------------------------------------------------------ copy and RTL rules */

test("every P4 string exists in all seven locales with no dash and no exclamation mark", () => {
  const seen = new Map();
  for (const code of PUBLIC_LOCALES) {
    const surfaces = {
      compare: compare(code, COMPARE_IDS).body.copy,
      about: renderAboutPage({ registry, localeCode: code }).body.copy,
      alerts: renderAlertsPage({ registry, localeCode: code }).body.copy,
    };
    const keys = {};
    for (const [surface, copy] of Object.entries(surfaces)) {
      keys[surface] = Object.keys(copy).sort();
      const walk = (value, path) => {
        if (typeof value === "string") {
          assert.ok(value.trim().length > 0, `${code}.${path} must not be empty`);
          assert.doesNotMatch(value, /[—–]/u, `${code}.${path} must not use a dash`);
          assert.doesNotMatch(value, /!/u, `${code}.${path} must not use an exclamation mark`);
          return;
        }
        if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        if (value && typeof value === "object") {
          for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
        }
      };
      walk(copy, surface);
    }
    seen.set(code, keys);
  }
  for (const code of PUBLIC_LOCALES) assert.deepEqual(seen.get(code), seen.get("en"), `${code} must carry the same keys as en`);
});

test("the listing cost vocabulary covers every approved fee line in all seven locales", () => {
  const lineKeys = ["local_transfer_tax", "notary_fee", "registry_entry_fee", "agency_fee", "company_route_setup"];
  for (const code of PUBLIC_LOCALES) {
    const locale = registry.locales.find((entry) => entry.code === code);
    const extras = listingExtras({ registry, locale, view: { id: "X", offer_type: "sale" }, path: `/${code}/x` });
    for (const key of lineKeys) {
      assert.ok(extras.costs.lines[key]?.label, `${code} needs a label for ${key}`);
      assert.ok(extras.costs.lines[key]?.note, `${code} needs a note for ${key}`);
    }
    assert.ok(extras.costs.buyers.eu && extras.costs.buyers.non_eu, `${code} needs both buyer scopes`);
  }
});

test("the rendered documents keep the public shell in RTL", () => {
  for (const [render, kind] of [
    [() => compare("he"), "compare"],
    [() => renderAboutPage({ registry, localeCode: "he" }), "about"],
    [() => renderAlertsPage({ registry, localeCode: "he" }), "alerts"],
  ]) {
    const page = render();
    const html = renderHtmlPage(page, { bodyHtml: renderReactPublicBody(page) });
    assert.equal(assertHtmlPage(html, { lang: "he", dir: "rtl", kind }), true);
  }
  const about = renderAboutPage({ registry, localeCode: "he" });
  const aboutHtml = renderHtmlPage(about, { bodyHtml: renderReactPublicBody(about) });
  // Absolute, because Google drops a relative hreflang and a share card cannot
  // resolve a relative og:url.
  assert.ok(aboutHtml.includes(`<link rel="canonical" href="${absolutePublicUrl("/he/about")}">`));
  assert.ok(!aboutHtml.includes(`hreflang="x-default" href="${absolutePublicUrl("/bg/za-nas")}"`));
  // Logical properties only, so Hebrew mirrors without a second stylesheet.
  assert.doesNotMatch(css, /(?:^|[\s;{])(?:margin|padding)-(?:left|right)\s*:/u);
  assert.doesNotMatch(css, /(?:^|[\s;{])(?:left|right)\s*:/u);
});

test("the stylesheet carries the touch, motion and print rules the package promises", () => {
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
  assert.match(css, /\.al-managed__field select:focus-visible \{/);
  assert.match(css, /\.al-managed__field select:disabled \{/);
  assert.match(css, /\.al-item__actions \.mk-btn:disabled,/);
  assert.match(css, /\.ld-costs__summary:hover \{/);
  assert.match(css, /\.ld-costs__summary:focus-visible \{/);
  assert.match(css, /\.ld-costs__summary:active \{/);
  assert.match(css, /\.site-hd__saved:focus-visible,/);
});

test("the client registers the package inits without disturbing the existing order", () => {
  assert.match(PUBLIC_APP_JS, /markSaved\(\);\s+initStartFlow\(\);/);
  assert.match(PUBLIC_APP_JS, /initCompareLinks\(\);\s+initComparePage\(\);\s+initAlertsPage\(\);/);
  assert.match(PUBLIC_APP_JS, /function initCompareLinks\(\)/);
  assert.match(PUBLIC_APP_JS, /function initAlertsPage\(\)/);
});
