import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { contentHash } from "../lib/translations.mjs";
import { normalizeSearchRequest } from "../lib/search-request.mjs";
import { interpretPublicSearch, explainPublicListingMatch, suggestPublicSearchAlternatives, PUBLIC_SEARCH_ASSISTANT_PATHS } from "../lib/public-search-assistant.mjs";
import { approvedPublicSeedFixture, approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const registry = loadLocaleRegistry();
const locale = "en";
const criteria = { property_type: "apartment", location: "Sandanski", price_min: 100000, price_max: 120000, bedrooms_min: 2, bedrooms_max: 3, area_min: 60, area_max: 100 };
function fixture() {
  const seed = approvedPublicSeedFixture();
  const records = seed.records.filter((row) => row.collection === "listings").slice(0, 3);
  for (const [index, row] of records.entries()) {
    Object.assign(row.facts, { property_type: "apartment", location: "Sandanski", offer_type: "sale", price_eur: 110000 + index * 20000, bedrooms: 2, area_sqm: 80, description: "Fixture source description.", listing_status: "available" });
    const copy = { title: "Fixture apartment", description: row.facts.description, seo_title: "Fixture title", meta_description: "Fixture description" };
    row.translations = registry.locales.filter((row) => row.public_enabled).map((lang) => ({ ...copy, listing: row.id, locale: lang.code, source_locale: row.source_locale, status: "published", translation_state: "published", human_approved: true, public_indexable: true, content_origin: "human", reviewer: "Fixture reviewer", approved_at: "2026-09-01T00:00:00Z", publication_authorized_by: "Fixture publisher", publication_authorized_at: "2026-09-01T00:00:00Z", published_at: "2026-09-01T00:00:00Z", source_hash: contentHash(row.facts), translated_hash: contentHash(copy) }));
  }
  seed.records = seed.records.filter((row) => row.collection !== "listings" || records.includes(row));
  return { seed, records };
}
const interpret = (text, current = {}) => interpretPublicSearch({ registry, input: { locale, text, current } });

test("interpretation proposes actual parsed filters and retains quiet and lift wishes before explicit apply", () => {
  const result = interpret("Quiet apartment in Sandanski, 2 bedrooms, under €120,000, with a lift.");
  assert.equal(result.proposed_intent.price_max, 120000);
  assert.deepEqual(result.proposed_intent.property_families, ["apartment"]);
  assert.deepEqual(result.proposed_intent.location_ids, ["Sandanski"]);
  assert.equal(result.proposed_intent.bedrooms_min, 2);
  assert.ok(result.unresolved.some((row) => /Quiet/i.test(row.text)));
  assert.ok(result.unresolved.some((row) => /lift/i.test(row.text)));
  assert.equal(result.applied, false);
  assert.equal(result.requires_confirmation, true);
  const url = new URL(result.proposed_url, "http://fixture.test");
  const request = normalizeSearchRequest(url.searchParams);
  assert.equal(request.intent.price_max, 120000);
  assert.equal(request.natural_language.original_query, result.original_query);
});

test("typed filter bounds, clears and aliases win without losing other inferred values", () => {
  const current = { filters: { price_max: 98765, property_type: "house", bedrooms_min: "" }, area_min: 61.5, area_max: 97.25 };
  const result = interpret("apartment in Sandanski, 2 bedrooms, under 120000", current);
  assert.equal(result.proposed_intent.price_max, 98765);
  assert.equal(result.proposed_intent.bedrooms_min, null);
  assert.deepEqual(result.proposed_intent.property_families, ["house"]);
  assert.deepEqual(result.proposed_intent.location_ids, ["Sandanski"]);
  assert.equal(result.proposed_intent.primary_area_min, 61.5);
  assert.equal(result.proposed_intent.primary_area_max, 97.25);
});

for (const text of ["apartment or house in Sandanski", "apartment in Sandanski or Petrich", "apartment for sale or rent", "not a house in Sandanski", "apartment under 80 sqm", "house under $100000", "house above 200000 below 100000"]) {
  test(`ambiguous or unsupported relation requires a choice: ${text}`, () => {
    const result = interpret(text);
    assert.equal(result.status, "needs_clarification");
    assert.equal(result.proposed_url, null);
    assert.equal(result.original_query, text);
  });
}

test("lexical fallback and unsafe input stay visible without an invented interpretation", () => {
  const result = interpret("Quiet with a lift");
  assert.equal(result.mode, "lexical_fallback");
  assert.equal(result.proposed_intent.text_query, "Quiet with a lift");
  assert.ok(result.unresolved.length);
  assert.equal(interpret("<b>apartment</b>").code, "interpretation_unavailable");
  assert.throws(() => interpret("x".repeat(241)), (error) => error.status === 400);
});

test("selected listing comparison cites the actual listing, current source and exact typed bounds", () => {
  const { seed, records } = fixture();
  const result = explainPublicListingMatch({ registry, seed, input: { locale, listingId: records[1].id, criteria } });
  assert.equal(result.status, "differs");
  const price = result.comparisons.find((row) => row.field === "price_max");
  assert.equal(price.status, "not_matched");
  assert.equal(price.evidence.value, 130000);
  assert.equal(price.evidence.source_hash, contentHash(records[1].facts));
  assert.equal(price.evidence.listing_id, records[1].id);
  assert.ok(price.evidence.canonical_url.endsWith(records[1].id));
  assert.equal(price.evidence.reviewer, "Fixture reviewer");
  assert.equal(result.suitability_score, null);
});

test("missing numeric facts stay unknown and unsupported criteria cannot become matches", () => {
  const { seed, records } = fixture();
  records[0].facts.price_eur = null; records[0].facts.area_sqm = null;
  for (const translation of records[0].translations) translation.source_hash = contentHash(records[0].facts);
  const result = explainPublicListingMatch({ registry, seed, input: { locale, listingId: records[0].id, criteria: { ...criteria, has_approved_tour: true, nl_context: "Quiet with a lift" } } });
  assert.equal(result.status, "incomplete");
  assert.ok(result.comparisons.filter((row) => /price_|primary_area/.test(row.field)).every((row) => row.status === "unknown" && row.evidence === null));
  assert.equal(result.comparisons.find((row) => row.field === "has_approved_tour").status, "unsupported");
  assert.equal(result.unresolved[0].text, "Quiet with a lift");
});

for (const [name, mutate] of [
  ["stale facts", (row) => { row.facts.price_eur++; }],
  ["unapproved locale", (row) => { row.translations.find((t) => t.locale === locale).human_approved = false; }],
  ["missing locale", (row) => { row.translations = row.translations.filter((t) => t.locale !== locale); }],
  ["changed copy", (row) => { row.translations.find((t) => t.locale === locale).description += " Added."; }],
  ["fake witness", (row) => { row.translations.find((t) => t.locale === locale).approved_at = "database_projection"; }],
]) test(`comparison and suggestions cannot bypass ${name}`, () => {
  const { seed, records } = fixture();
  records.forEach(mutate);
  const result = explainPublicListingMatch({ registry, seed, input: { locale, listingId: records[0].id, criteria } });
  assert.equal(result.code, "approved_source_unavailable");
  assert.deepEqual(result.comparisons, []);
  assert.equal(suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria } }).status, "unavailable");
});

test("old explanation hashes request refresh and private listings reveal no facts", () => {
  const { seed, records } = fixture();
  const result = explainPublicListingMatch({ registry, seed, input: { locale, listingId: records[0].id, criteria, sourceHash: "0".repeat(64) } });
  assert.equal(result.code, "source_changed"); assert.deepEqual(result.comparisons, []);
  records[0].facts.listing_status = "sold";
  assert.throws(() => explainPublicListingMatch({ registry, seed, input: { locale, listingId: records[0].id, criteria } }), (error) => error.status === 404);
});

test("alternatives use actual approved inventory and change exactly one criterion", () => {
  const { seed } = fixture();
  const before = JSON.stringify(seed);
  const result = suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria: { ...criteria, nl_context: "Quiet with a lift" } } });
  const alternative = result.alternatives.find((row) => row.change.field === "price_max");
  assert.equal(alternative.change.before, 120000);
  assert.equal(alternative.change.after, 130000);
  assert.equal(alternative.matching_reviewed_listings, 2);
  assert.equal(result.matching_reviewed_listings, 1);
  assert.equal(result.result_count, null);
  assert.deepEqual(Object.keys(result.criteria).filter((key) => JSON.stringify(result.criteria[key]) !== JSON.stringify(alternative.proposed_intent[key])), ["price_max"]);
  assert.equal(new URL(alternative.proposed_url, "http://fixture.test").searchParams.get("nl_context"), "Quiet with a lift");
  assert.equal(alternative.applied, false);
  assert.equal(JSON.stringify(seed), before);
});

test("explicit arbitrary numeric change is previewed; multiple changes and gate removal are refused", () => {
  const { seed } = fixture();
  const result = suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria, change: { field: "price_max", value: 132456.78 } } });
  assert.equal(result.status, "preview");
  assert.equal(result.alternatives[0].change.after, 132456.78);
  for (const change of [{ field: "mandatory_filters", value: {} }, { field: "price_max", value: 0 }, { field: "price_max", value: 50000 }, { field: "price_max", value: 140000, location: "Petrich" }]) {
    assert.throws(() => suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria, change } }), (error) => error.status === 400);
  }
});

test("runtime parity: all three APIs preserve source/criteria and enforce origin, body and input guards", async (t) => {
  const { seed, records } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-public-assistant-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cmsSeedPath = path.join(directory, "seed.json"); fs.writeFileSync(cmsSeedPath, JSON.stringify(seed));
  const config = { ...appApiConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), cmsSeedPath, rateLimit: null };
  const app = createHttpApp({ seed, rateLimit: null, listingEditLedgerPath: config.listingEditLedgerPath, mediaReviewLedgerPath: config.mediaReviewLedgerPath, mediaUploadLedgerPath: config.mediaUploadLedgerPath });
  const bodies = [{ locale, text: "apartment under 120000", current: criteria }, { locale, listingId: records[1].id, criteria }, { locale, criteria }];
  for (const [i, pathname] of PUBLIC_SEARCH_ASSISTANT_PATHS.entries()) {
    const send = async (body, extra = {}) => {
      const headers = { origin: "http://fixture.test", host: "fixture.test", "content-type": "application/json", ...extra };
      const text = typeof body === "string" ? body : JSON.stringify(body);
      const next = await renderAppApiResponse(new Request(`http://fixture.test${pathname}`, { method: "POST", headers, body: text }), { config });
      const node = await dispatchHttp(app, { url: pathname, method: "POST", headers, body: text });
      assert.equal(node.status, next.status);
      const result = await next.json();
      if (next.status === 200) { delete result.checked_at; delete node.body.checked_at; assert.deepEqual(result, node.body); }
      assert.match(next.headers.get("cache-control"), /no-store/);
      assert.match(node.headers["cache-control"], /no-store/);
      return next.status;
    };
    assert.equal(await send(bodies[i]), 200);
    assert.equal(await send({ ...bodies[i], privateLead: "forbidden" }), 400);
    assert.equal(await send("{"), 400);
    assert.equal(await send(bodies[i], { origin: "https://other.test" }), 403);
    assert.equal(await send("x".repeat(8193)), 413);
  }
});

test("all registry locales get localised response copy, and each API uses the existing rate limit", async () => {
  for (const row of registry.locales.filter((row) => row.public_enabled && row.indexable)) {
    const result = interpretPublicSearch({ registry, input: { locale: row.code, text: "Sandanski" } });
    assert.equal(result.locale, row.code);
    assert.ok(result.message);
    if (row.code !== "en") assert.notEqual(result.message, interpret("Sandanski").message);
  }
  for (const pathname of PUBLIC_SEARCH_ASSISTANT_PATHS) {
    const config = { ...appApiConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), rateLimit: { windowMs: 60000, max: 1 } };
    const app = createHttpApp({ seed: fixture().seed, rateLimit: { windowMs: 60000, max: 1 } });
    for (const type of ["next", "node"]) {
      const send = async () => {
        const headers = { origin: "http://fixture.test", host: "fixture.test", "content-type": "application/json" };
        return type === "next" ? renderAppApiResponse(new Request(`http://fixture.test${pathname}`, { method: "POST", headers, body: "{}" }), { config }) : dispatchHttp(app, { url: pathname, method: "POST", headers, body: "{}" });
      };
      assert.equal((await send()).status, 400);
      assert.equal((await send()).status, 429);
    }
  }
});

test("unsupported currency and tour criteria never disappear; unsupported map input is refused", () => {
  const { seed, records } = fixture();
  const input = { locale, criteria: { ...criteria, price_currency: "USD", has_approved_tour: true } };
  const result = explainPublicListingMatch({ registry, seed, input: { ...input, listingId: records[0].id } });
  for (const field of ["price_currency", "has_approved_tour"]) assert.equal(result.comparisons.find((row) => row.field === field).status, "unsupported");
  assert.equal(suggestPublicSearchAlternatives({ registry, seed, input }).alternatives.length, 0);
  assert.throws(() => explainPublicListingMatch({ registry, seed, input: { ...input, listingId: records[0].id, criteria: { ...criteria, map_bounds: [22, 41, 24, 43] } } }), (error) => error.code === "invalid_search_criteria");
});

test("an unavailable approval cannot be reported as zero results for an explicit change", () => {
  const { seed, records } = fixture();
  for (const row of records) row.translations = [];
  const result = suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria, change: { field: "price_max", value: 140000 } } });
  assert.equal(result.status, "unavailable");
  assert.equal(result.matching_reviewed_listings, null);
  assert.equal(result.alternatives[0].matching_reviewed_listings, null);
});

test("normalised unchanged values are not offered as a change and protected gates cannot be altered", () => {
  const { seed } = fixture();
  for (const change of [{ field: "price_max", value: "120000" }, { field: "property_families", value: "apartment" }]) {
    assert.throws(() => suggestPublicSearchAlternatives({ registry, seed, input: { locale, criteria, change } }), (error) => error.code === "search_change_required");
  }
  const intent = normalizeSearchRequest(criteria).intent;
  assert.throws(() => explainPublicListingMatch({ registry, seed, input: { locale, listingId: "MS-CRAWL-0001", criteria: { ...intent, mandatory_filters: { ...intent.mandatory_filters, translation_human_approved: false } } } }), (error) => error.status === 400);
});

test("unrecognised decimal amount formatting requires clarification instead of changing its magnitude", () => {
  for (const text of ["apartment under €120,000.50", "house under 80 m²"]) {
    const result = interpret(text);
    assert.equal(result.status, "needs_clarification");
    assert.equal(result.proposed_url, null);
  }
  assert.equal(interpret("apartment under 120.5k").proposed_intent.price_max, 120500);
});


test("number units, upper bedroom bounds and billing periods cannot silently become different filters", () => {
  for (const text of ["apartment under 3 bedrooms", "apartment with at most 3 bedrooms", "apartment under 1000 per month", "house under 3 bathrooms", "апартамент под 3 спални"]) {
    const result = interpret(text);
    assert.equal(result.status, "needs_clarification", text);
    assert.equal(result.proposed_url, null, text);
    assert.equal(result.proposed_intent.price_max, null, text);
    assert.equal(result.proposed_intent.bedrooms_min, null, text);
    assert.deepEqual(result.unresolved, [{ text, reason: "not_applied_as_filter" }]);
  }
  const supported = interpret("apartment with 3 bedrooms under 120000");
  assert.equal(supported.proposed_intent.price_max, 120000);
  assert.equal(supported.proposed_intent.bedrooms_min, 3);
});


test("explicit reviewed choices resolve conflicting inferences while inherited values do not", () => {
  const text = "apartment or house in Sandanski with a lift";
  const current = { property_families: ["house"], location_ids: ["Sandanski"] };
  const unresolved = interpret(text, current);
  assert.equal(unresolved.status, "needs_clarification");
  assert.deepEqual(unresolved.ambiguities[0].required_fields, ["property_families"]);
  const result = interpretPublicSearch({ registry, input: { locale, text, current, reviewed_fields: ["property_families"] } });
  assert.equal(result.status, "review_with_unresolved");
  assert.deepEqual(result.proposed_intent.property_families, ["house"]);
  assert.ok(result.proposed_url);
  assert.equal(result.original_query, text);
  assert.ok(result.unresolved.some((row) => /lift/.test(row.text)));
  assert.equal(result.resolved_ambiguities.length, 1);
});

test("reviewing an unrelated field cannot resolve an ambiguous choice or missing explicit value", () => {
  const text = "apartment or house in Sandanski";
  const result = interpretPublicSearch({ registry, input: { locale, text, current: { price_max: 120000 }, reviewed_fields: ["price_max"] } });
  assert.equal(result.proposed_url, null);
  assert.throws(() => interpretPublicSearch({ registry, input: { locale, text, current: {}, reviewed_fields: ["property_families"] } }), (error) => error.code === "reviewed_field_value_required");
  assert.throws(() => interpretPublicSearch({ registry, input: { locale, text, current: {}, reviewed_fields: ["mandatory_filters"] } }), (error) => error.code === "invalid_reviewed_fields");
});

test("reviewed numeric fields can correct a reversed range without rewriting original words", () => {
  const text = "apartment above 200000 below 100000";
  const current = { price_min: 90000, price_max: 150000 };
  const result = interpretPublicSearch({ registry, input: { locale, text, current, reviewed_fields: ["price_min", "price_max"] } });
  assert.ok(result.proposed_url);
  assert.equal(result.proposed_intent.price_min, 90000);
  assert.equal(result.proposed_intent.price_max, 150000);
  assert.equal(result.original_query, text);
  assert.equal(result.resolved_ambiguities[0].reason, "invalid_range");
  assert.equal(interpretPublicSearch({ registry, input: { locale, text, current, reviewed_fields: ["price_min"] } }).proposed_url, null);
});

test("explicit choices replace conflicting units but never confirm those units or a billing period", () => {
  const text = "apartment under 3 bedrooms";
  const current = { property_families: ["apartment"], price_max: null, bedrooms_min: null, bedrooms_max: 3 };
  const result = interpretPublicSearch({ registry, input: { locale, text, current, reviewed_fields: ["property_families", "price_max", "bedrooms_min", "bedrooms_max"] } });
  assert.ok(result.proposed_url);
  assert.equal(result.proposed_intent.price_max, null);
  assert.equal(result.proposed_intent.bedrooms_max, 3);
  assert.deepEqual(result.unresolved, [{ text, reason: "not_applied_as_filter" }]);
  assert.ok(result.inferred.every((row) => !row.included));
  assert.equal(result.proposed_intent.price_period, null);
});
