import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { loadGeographyCatalog, loadGeographyRegistry, geographyRegistryArea } from "../lib/geography.mjs";
import { normalizePublicLeadInput } from "../lib/leads.mjs";
import { assertLocaleRegistry, loadLocaleRegistry, publicIndexableLocales } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { renderStartPage, startSearchParams } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { renderHtmlPage, assertHtmlPage } from "../lib/html.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { normalizeSearchRequest } from "../lib/search-request.mjs";
import { hreflangForStart, startPath } from "../lib/seo.mjs";
import { buildAppRouteManifest } from "../lib/app-route-manifest.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-start-page-payload-secret-32-characters",
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-start-page-contact-key-32-characters",
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
});

const registry = loadLocaleRegistry();
const listings = loadListings();
const seed = loadCmsSeed();
const css = fs.readFileSync(fromRoot("production", "lib", "ui", "adapter-public-start.css"), "utf8");
const PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];
const ANSWERED = "offer_type=sale&property_family=apartment&area=sandanski&price_max=150000&bedrooms_min=2&citizenship=non_eu&financing=mortgage&timeline=soon";

function render(localeCode, query = "", options = {}) {
  return renderStartPage({
    registry,
    localeCode,
    listings,
    searchParams: query ? new URLSearchParams(query) : null,
    leadWritesDisabled: false,
    ...options,
  });
}

test("every public locale routes its own buyer onboarding segment", () => {
  assert.equal(assertLocaleRegistry(registry), true);
  assert.equal(startPath(registry, "bg"), "/bg/nachalo");
  assert.equal(startPath(registry, "en"), "/en/start");
  assert.equal(startPath(registry, "de"), "/de/start");
  assert.equal(startPath(registry, "nl"), "/nl/start");
  assert.equal(startPath(registry, "ru"), "/ru/start");
  assert.equal(startPath(registry, "el"), "/el/arxi");
  assert.equal(startPath(registry, "he"), "/he/start");
  // One alternate per indexable locale plus x-default.
  assert.equal(hreflangForStart(registry).length, publicIndexableLocales(registry).length + 1);
  assert.equal(hreflangForStart(registry).at(-1).href, "/bg/nachalo");
});

test("the runtime resolves the onboarding route in every public locale and rejects a foreign slug", () => {
  for (const code of PUBLIC_LOCALES) {
    const page = renderRuntimePath(registry, seed, startPath(registry, code));
    assert.equal(page.kind, "start", `${code} must resolve the onboarding route`);
    assert.equal(page.locale, code);
    assert.equal(page.status, 200);
  }
  assert.equal(renderRuntimePath(registry, seed, "/bg/start").kind, "not_found");
  assert.equal(renderRuntimePath(registry, seed, "/he/start").dir, "rtl");
});

test("the App Router manifest maps a buyer onboarding entry to the catch-all content route", () => {
  const manifest = buildAppRouteManifest({
    registry,
    sitemap: { entries: [{ type: "start", locale: "en", loc: "/en/start", hreflang: [{ hreflang: "en", href: "/en/start" }] }] },
    generatedAt: "2026-08-23T00:00:00Z",
  });
  const route = manifest.routes.find((entry) => entry.path === "/en/start");
  assert.equal(route.renderer, "renderStartPage");
  assert.equal(route.app_module, "app/[locale]/[...slug]/route");
});

test("the unanswered page is one indexable GET form with four steps", () => {
  const page = render("en");
  assert.equal(page.kind, "start");
  assert.equal(page.path, "/en/start");
  assert.equal(page.canonical, "/en/start");
  assert.equal(page.indexable, true);
  assert.equal(page.metadata.robots, "index,follow");
  assert.equal(page.body.state, "answer");
  assert.equal(page.body.finish, null);
  assert.deepEqual(
    page.body.steps.map((step) => step.id),
    ["intent", "where", "budget", "about"],
  );

  const html = renderReactPublicBody(page);
  assert.match(html, /data-react-public-ui="start"/);
  assert.match(html, /<form id="start-form"[^>]*method="get" action="\/en\/start" data-start-form="true"/);
  // Exactly the four step sections, all rendered (JavaScript hides all but one).
  assert.equal((html.match(/data-start-step="[1-4]"/g) || []).length, 4);
  assert.equal((html.match(/data-start-step-indicator="[1-4]"/g) || []).length, 4);
  // The step form carries exactly one submit for the no-JavaScript path; the
  // next and back controls stay type=button so they cannot post a half answer.
  const stepForm = html.slice(html.indexOf('id="start-form"'), html.indexOf("</form>", html.indexOf('id="start-form"')));
  assert.equal((stepForm.match(/type="submit"/g) || []).length, 1);
  assert.equal((stepForm.match(/data-start-continue="true"/g) || []).length, 1);
  assert.equal((stepForm.match(/<button [^>]*type="button"[^>]*data-start-(?:next|back)="true"/g) || []).length, 6);
  assert.match(stepForm, /class="st-actions st-actions--final"/);
  // A stepper page owns the bottom of the viewport, so the mobile task bar is out.
  assert.doesNotMatch(html, /data-mobile-task-navigation="true"/);
});

test("answered query variants render the finish step server-side and stay out of the index", () => {
  const page = render("en", ANSWERED);
  assert.equal(page.body.state, "finish");
  assert.equal(page.metadata.robots, "noindex,follow");
  assert.equal(page.canonical, "/en/start");
  assert.equal(page.body.finish.summary.length, 8);
  assert.equal(page.body.finish.match_count > 0, true);

  const url = new URL(page.body.finish.search_url, "https://example.test");
  assert.equal(url.pathname, "/en/search");
  // The finish link must be a search request the results page accepts.
  const request = normalizeSearchRequest(url.searchParams, { defaultLocale: "en" });
  assert.equal(request.intent.offer_type, "sale");
  assert.deepEqual(request.intent.property_families, ["apartment"]);
  assert.equal(request.intent.geography_id, "BG:municipality:BLG40");
  assert.equal(request.intent.price_max, 150000);
  assert.equal(request.intent.bedrooms_min, 2);

  const html = renderReactPublicBody(page);
  assert.match(html, /data-start-state="finish"/);
  assert.match(html, /data-start-summary-row="offer_type"/);
  assert.match(html, /data-start-edit="true"/);
});

test("every onboarding area resolves in the geography data the search uses", () => {
  const catalog = loadGeographyCatalog();
  const geographyRegistry = loadGeographyRegistry();
  const areas = render("en").body.areas;
  assert.deepEqual(
    areas.map((area) => area.id),
    ["sandanski", "bansko", "blagoevgrad_district", "black_sea_coast", "greece"],
  );
  for (const area of areas) {
    for (const [key, value] of Object.entries(area.search)) {
      if (key === "country_code") {
        assert.equal(catalog.countries.some((country) => country.code === value), true, `${area.id} country must exist`);
        continue;
      }
      assert.ok(geographyRegistryArea(geographyRegistry, value), `${area.id} area ${value} must exist`);
    }
  }
});

test("bedrooms are dropped for families that carry no bedroom count", () => {
  const plot = render("en", "offer_type=sale&property_family=plot&area=greece&bedrooms_min=3&citizenship=eu&financing=cash&timeline=year");
  assert.equal(plot.body.finish.search_url.includes("bedrooms_min"), false);
  assert.equal(plot.body.finish.search_url.includes("country_code=GR"), true);
  assert.equal(plot.body.finish.summary.some((row) => row.id === "bedrooms_min"), false);
  assert.equal(startSearchParams({ property_family: "plot", bedrooms_min: 3, area: "", offer_type: "sale" }).has("bedrooms_min"), false);
  assert.equal(startSearchParams({ property_family: "house", bedrooms_min: 3, area: "", offer_type: "sale" }).get("bedrooms_min"), "3");

  const html = renderReactPublicBody(plot);
  assert.match(html, /data-start-bedrooms="true" hidden/);
});

test("step four states the EU land rule and the financing gap once each", () => {
  const en = render("en");
  assert.equal(
    en.body.notes.land_rule,
    "Non-EU citizens cannot own land in their own name in Bulgaria and hold it through a Bulgarian company, while EU and EEA citizens can buy land directly.",
  );
  assert.equal(
    en.body.notes.financing_gap,
    "Bulgarian banks offer no standard mortgage to foreign nationals, so plan your financing before you view.",
  );
  const html = renderReactPublicBody(en);
  assert.equal((html.match(/data-start-note="land_rule"/g) || []).length, 1);
  assert.equal((html.match(/data-start-note="financing_gap"/g) || []).length, 1);
});

test("the broker shortlist posts the buyer onboarding lead source the contract accepts", () => {
  const page = render("en", ANSWERED);
  const shortlist = page.body.shortlist;
  assert.equal(shortlist.endpoint, "/api/leads");
  assert.equal(shortlist.payload.source, "website_buyer_onboarding");
  assert.equal(shortlist.payload.intent, "consultation");
  assert.equal(shortlist.payload.leadType, "foreign_buyer");
  assert.equal(shortlist.requirements.locations, "Sandanski");
  assert.equal(shortlist.requirements.finance_status, "mortgage");

  const lead = normalizePublicLeadInput({
    source: shortlist.payload.source,
    intent: shortlist.payload.intent,
    leadType: shortlist.payload.leadType,
    language: shortlist.payload.language,
    contact_preference: shortlist.payload.contact_preference,
    contact: { name: "Test Person", phone: "+359879000000" },
    message: shortlist.message,
    "requirements.locations": shortlist.requirements.locations,
    "requirements.property_types": shortlist.requirements.property_types,
    "requirements.budget_max_eur": shortlist.requirements.budget_max_eur,
    "requirements.bedrooms_min": shortlist.requirements.bedrooms_min,
    "requirements.timeline": shortlist.requirements.timeline,
    "requirements.finance_status": shortlist.requirements.finance_status,
  });
  assert.equal(lead.intent, "consultation");
  assert.equal(lead.leadType, "foreign_buyer");
  assert.deepEqual(lead.requirements.locations, ["Sandanski"]);
  assert.equal(lead.requirements.budget_max_eur, 150000);
  assert.equal(lead.requirements.finance_status, "mortgage");

  // A lead type the source does not cover must still be rejected.
  assert.throws(
    () =>
      normalizePublicLeadInput({
        source: "website_buyer_onboarding",
        leadType: "seller",
        contact: { name: "Spoof", phone: "+359880000009" },
      }),
    /Lead type must match source/,
  );
});

test("the lead segment follows the answers", () => {
  assert.equal(render("en", "offer_type=rent&area=sandanski&citizenship=non_eu").body.shortlist.payload.leadType, "renter");
  assert.equal(render("en", "offer_type=sale&area=sandanski&citizenship=non_eu").body.shortlist.payload.leadType, "foreign_buyer");
  assert.equal(render("en", "offer_type=sale&area=sandanski&citizenship=eu").body.shortlist.payload.leadType, "buyer");
});

test("no matching properties offers wider searches that do have listings", () => {
  const zero = render("en", "offer_type=sale&property_family=house&area=sandanski&price_max=50000&bedrooms_min=4&citizenship=eu&financing=cash&timeline=year");
  assert.equal(zero.body.finish.match_count, 0);
  assert.ok(zero.body.finish.widen.length > 0, "a zero-match finish must offer a wider search");
  for (const option of zero.body.finish.widen) {
    assert.ok(option.match_count > 0, `${option.id} must lead to real matches`);
    assert.ok(option.url.startsWith("/en/search?"));
    normalizeSearchRequest(new URL(option.url, "https://example.test").searchParams, { defaultLocale: "en" });
  }

  const html = renderReactPublicBody(zero);
  assert.match(html, /data-start-widen="true"/);
  assert.doesNotMatch(html, /data-start-widen="true"[^>]*hidden/);
  assert.match(html, /data-start-widen-option="price"/);

  // With matches the widen block is rendered but hidden.
  const matched = render("en", ANSWERED);
  assert.deepEqual(matched.body.finish.widen, []);
  assert.match(renderReactPublicBody(matched), /data-start-widen="true"[^>]*hidden/);
});

test("saved-search alerts reuse the existing public contract", () => {
  const page = render("en", ANSWERED);
  assert.equal(page.body.alert.endpoint, "/api/saved-searches");
  assert.deepEqual(page.body.alert.payload.filters, {
    offer_type: "sale",
    property_family: "apartment",
    geography_id: "BG:municipality:BLG40",
    price_max: "150000",
    bedrooms_min: "2",
  });
  const html = renderReactPublicBody(page);
  assert.match(html, /data-save-search-endpoint="\/api\/saved-searches" data-save-search-form="start"/);
  assert.match(html, /name="alertConsent"/);
  // The shared channel switcher rewrites the label text, so the contact input
  // must stay a sibling of its label instead of a child.
  assert.match(html, /data-save-search-contact-label="true"[^>]*>[^<]*<\/label><input id="start-alert-contact"/);
});

test("features without a backend render as disabled coming-soon affordances", () => {
  const cash = render("en", "offer_type=sale&area=sandanski&citizenship=eu&financing=cash&timeline=year");
  const mortgage = render("en", ANSWERED);
  assert.deepEqual(cash.body.upcoming.map((item) => [item.id, item.visible]), [["viewing_trip", true], ["financing", false]]);
  assert.deepEqual(mortgage.body.upcoming.map((item) => [item.id, item.visible]), [["viewing_trip", true], ["financing", true]]);

  const html = renderReactPublicBody(mortgage);
  // Financing still has no backend, so it keeps the disabled control and badge.
  assert.match(html, /<button type="button" class="mk-btn mk-btn--secondary mk-btn--md" disabled aria-disabled="true" data-start-upcoming-action="financing"/);
  assert.match(html, /data-start-upcoming-item="financing" data-start-upcoming-when="mortgage"/);
  assert.doesNotMatch(renderReactPublicBody(cash), /data-start-upcoming-item="financing"[^>]*data-start-upcoming-when="mortgage">/);
});

// B5 built the viewing-trip request, so the control is real: no disabled button,
// no coming-soon badge, and a form that posts to the public request route.
test("the viewing trip control is a real request a broker confirms", () => {
  const mortgage = render("en", ANSWERED);
  const trip = mortgage.body.upcoming.find((item) => item.id === "viewing_trip");
  assert.equal(trip.request.endpoint, "/api/viewing-trips");
  assert.equal(trip.request.confirmation, "human_required");

  const html = renderReactPublicBody(mortgage);
  assert.match(html, /data-start-upcoming-item="viewing_trip"[^>]*data-start-upcoming-live="true"/);
  assert.match(html, /data-start-upcoming-action="viewing_trip"[^>]*aria-describedby="start-upcoming-viewing_trip"/);
  assert.doesNotMatch(html, /disabled aria-disabled="true" data-start-upcoming-action="viewing_trip"/);
  assert.match(html, /<form[^>]*action="\/api\/viewing-trips"[^>]*data-start-trip-form="true"/);
  assert.match(html, /name="arrivalDate"/);
  assert.match(html, /name="departureDate"/);
  assert.match(html, /name="areas"/);
  assert.match(html, /data-start-trip-shortlist="true"/);
  // The copy has to keep saying a person confirms the days.
  assert.match(html, /This is a request\. A person confirms every viewing\./);

  // The status line has to carry the name the client actually wires, and the
  // form has to carry the server's "area or property" rule so the visitor is
  // told which field is missing instead of "Request failed".
  const tripFormHtml = html.slice(html.indexOf('data-start-trip-form="true"'));
  assert.match(tripFormHtml.slice(0, tripFormHtml.indexOf("</form>")), /data-start-status="true"/);
  assert.doesNotMatch(html, /data-start-trip-status/);
  assert.equal(trip.request.scope_required, "Add at least one area or one saved property.");
  assert.match(html, /data-start-trip-scope-message="Add at least one area or one saved property\."/);
  assert.match(PUBLIC_APP_JS, /data-start-trip-scope-message/);
  assert.match(PUBLIC_APP_JS, /wireSubmitStatus\(tripForm\)/);
});

// Attribution is the same on every lead form or the channel report has a hole
// exactly where the buyer-onboarding leads are.
test("the onboarding shortlist lead form carries the same attribution as every other lead form", () => {
  const html = renderReactPublicBody(render("en", ANSWERED));
  const form = html.slice(html.indexOf('data-start-lead="true"'));
  const body = form.slice(0, form.indexOf("</form>"));

  assert.match(body, /name="channel"[^>]*data-lead-channel-field="true"/);
  assert.match(body, /name="firstTouchPath"[^>]*data-first-touch-field="true"/);
});

// The onboarding shortlist is a lead like any other, so it must never render a
// form the edge would reject. It degrades to the phone path the contact and
// seller pages already use.
test("the shortlist degrades to a phone CTA when lead writes are disabled", () => {
  const disabled = renderStartPage({ registry, localeCode: "bg", listings, leadWritesDisabled: true });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.indexable, true);
  assert.equal(disabled.chrome.lead_writes_disabled, true);
  assert.equal(disabled.body.shortlist, null);
  assert.equal(disabled.body.form_unavailable, "Формата е временно недостъпна. Обадете се или ни пишете и брокер ще помогне.");

  const html = renderReactPublicBody(disabled);
  assert.doesNotMatch(html, /data-start-lead="true"/);
  assert.doesNotMatch(html, /action="\/api\/leads"/);
  assert.match(html, /data-form-unavailable="true"/);
  assert.match(html, /href="tel:\+359879696870"/);
});

test("every onboarding string exists in all seven public locales without dashes", () => {
  const seen = new Map();
  for (const code of PUBLIC_LOCALES) {
    const page = render(code, ANSWERED);
    const copy = page.body.copy;
    const keys = Object.keys(copy).sort();
    seen.set(code, keys);
    for (const [key, value] of Object.entries(copy)) {
      const values = typeof value === "string" ? [value] : Object.values(value);
      for (const text of values) {
        assert.ok(String(text).trim().length > 0, `${code}.${key} must not be empty`);
        assert.doesNotMatch(String(text), /[—–]/, `${code}.${key} must not use a dash`);
        assert.doesNotMatch(String(text), /!/, `${code}.${key} must not use an exclamation mark`);
      }
    }
    assert.equal(page.lang, code);
    assert.equal(page.dir, code === "he" ? "rtl" : "ltr");
    assert.equal(page.body.h1.length > 0, true);
    assert.equal(page.body.areas.every((area) => area.label && area.note), true);
  }
  for (const code of PUBLIC_LOCALES) assert.deepEqual(seen.get(code), seen.get("en"), `${code} must carry the same keys as en`);
});

test("the rendered document keeps the public shell in RTL", () => {
  const page = render("he", ANSWERED);
  const html = renderHtmlPage(page, { bodyHtml: renderReactPublicBody(page) });
  assert.equal(assertHtmlPage(html, { lang: "he", dir: "rtl", kind: "start" }), true);
  assert.match(html, /<link rel="canonical" href="\/he\/start">/);
  assert.match(html, /hreflang="x-default" href="\/bg\/nachalo"/);
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
});

test("the client enhances the page into a stepper and the stylesheet carries every control state", () => {
  assert.match(PUBLIC_APP_JS, /function initStartFlow\(\)/);
  assert.match(PUBLIC_APP_JS, /markSaved\(\);\s+initStartFlow\(\);/);
  assert.match(PUBLIC_APP_JS, /main\[data-start-flow\]/);
  // Answers drive the results link, the lead payload, the alert filters and the
  // conditional coming-soon panel.
  assert.match(PUBLIC_APP_JS, /function syncLead\(\)/);
  assert.match(PUBLIC_APP_JS, /function syncAlert\(\)/);
  assert.match(PUBLIC_APP_JS, /function syncUpcoming\(\)/);
  assert.match(PUBLIC_APP_JS, /function syncWiden\(zero\)/);
  assert.match(PUBLIC_APP_JS, /data-start-error/);
  assert.match(PUBLIC_APP_JS, /data-sending-message/);
  // The step buttons are inert without this script, so they stay hidden until
  // the stepper marks the page enhanced.
  assert.match(PUBLIC_APP_JS, /root\.setAttribute\("data-start-enhanced", "true"\)/);
  assert.match(css, /\.st-page:not\(\[data-start-enhanced\]\) \.st-actions:not\(\.st-actions--final\) \{ display: none; \}/);

  assert.match(css, /\.st-chip:hover > span \{/);
  assert.match(css, /\.st-chip:has\(input:checked\) > span \{/);
  assert.match(css, /\.st-chip:has\(input:focus-visible\) > span \{/);
  assert.match(css, /\.st-chip:has\(input:disabled\) > span \{/);
  assert.match(css, /\.st-tile:has\(input:checked\) \.st-tile__body \{/);
  assert.match(css, /\.st-tile:has\(input:focus-visible\) \.st-tile__body \{/);
  assert.match(css, /\.st-error \{/);
  assert.match(css, /\.st-lead__status \{/);
  assert.match(css, /\.st-upcoming \.mk-btn:disabled \{/);
  assert.match(css, /@media \(pointer: coarse\)/);
  // Logical properties only, so Hebrew mirrors without a second stylesheet.
  assert.doesNotMatch(css, /(?:^|[\s;{])(?:margin|padding)-(?:left|right)\s*:/);
  assert.doesNotMatch(css, /(?:^|[\s;{])(?:left|right)\s*:/);
});
