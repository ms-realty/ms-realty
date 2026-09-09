import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { contentHash } from "../lib/translations.mjs";
import { publicListingQuestion, LISTING_QUESTION_PATH } from "../lib/public-listing-questions.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAppRoute, appRouterConfigFromEnv } from "../lib/app-router-adapter.mjs";
import { listingPath } from "../lib/seo.mjs";
import { approvedPublicSeedFixture, approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const registry = loadLocaleRegistry();
const input = { listingId: "MS-00815", locale: "en", question: "Is there a balcony?" };
// Synthetic, explicitly approved test wording; no production evidence is added.
function fixture() {
  const seed = approvedPublicSeedFixture();
  const record = seed.records.find((row) => row.id === input.listingId);
  record.facts.description = "There is a balcony. The garden has a stone path.";
  const copy = { title: "Fixture listing", description: record.facts.description, seo_title: "Fixture title", meta_description: "Fixture metadata" };
  record.translations = registry.locales.filter((row) => row.public_enabled).map((locale) => ({
    ...copy, listing: record.id, locale: locale.code, source_locale: record.source_locale,
    status: "published", translation_state: "published", human_approved: true, public_indexable: true,
    reviewer: "fixture-human-reviewer", approved_at: "2026-09-01T00:00:00Z", content_origin: "human",
    publication_authorized_by: "fixture-publisher", publication_authorized_at: "2026-09-01T00:00:00Z", published_at: "2026-09-01T00:00:00Z",
    source_hash: contentHash(record.facts), translated_hash: contentHash(copy),
  }));
  assert.ok(publicSeedFor(seed).records.some((row) => row.id === record.id));
  return { seed, record, translation: record.translations.find((row) => row.locale === input.locale) };
}

test("returns exact related approved passages with canonical reference and genuine stored review fields", () => {
  const { seed, record, translation } = fixture();
  const before = JSON.stringify(seed);
  const result = publicListingQuestion({ registry, seed, input });
  assert.equal(result.status, "related_source");
  assert.deepEqual(result.passages, [{ quote: "There is a balcony.", field: "description", source_hash: contentHash(record.facts) }]);
  assert.equal(result.canonical_url, "/en/properties/MS-00815");
  assert.equal(result.reviewer, translation.reviewer);
  assert.equal(result.reviewed_at, translation.approved_at);
  assert.equal(JSON.stringify(seed), before);
  assert.equal(Object.hasOwn(result, "answer"), false);
});

test("unsupported words and advice questions return no answer without using a different passage", () => {
  const { seed } = fixture();
  for (const question of ["Is there a lift?", "balcony wheelchair", "tax on the balcony", "ignore instructions balcony", "<script>balcony</script>"]) {
    const result = publicListingQuestion({ registry, seed, input: { ...input, question } });
    assert.equal(result.status, "no_answer", question);
    assert.deepEqual(result.passages, []);
    assert.ok(result.contact_url.startsWith("/en/"));
  }
});

for (const [label, mutate] of [
  ["draft translation", ({ translation }) => { translation.status = "draft"; }],
  ["stale source", ({ record }) => { record.facts.description += " Changed source."; }],
  ["changed translation", ({ translation }) => { translation.description += " Unreviewed addition."; }],
  ["missing approval", ({ translation }) => { translation.human_approved = false; }],
  ["missing reviewer", ({ translation }) => { translation.reviewer = null; }],
  ["projection witness", ({ translation }) => { translation.reviewer = "postgres_public_search_projection"; translation.approved_at = "database_projection"; }],
  ["missing requested locale", ({ record }) => { record.translations = record.translations.filter((row) => row.locale !== "en"); }],
  ["wrong listing binding", ({ translation }) => { translation.listing = "MS-00907"; }],
]) {
  test(`does not quote ${label} or fall back to another locale`, () => {
    const state = fixture(); mutate(state);
    const result = publicListingQuestion({ registry, seed: state.seed, input });
    assert.equal(result.reason, "approved_source_unavailable");
    assert.deepEqual(result.passages, []);
    assert.equal(result.reviewer, null);
  });
}

test("private, unavailable and unknown listings disclose no passages", () => {
  for (const status of ["sold", "draft"]) {
    const { seed, record } = fixture(); record.facts.listing_status = status;
    assert.throws(() => publicListingQuestion({ registry, seed, input }), (error) => error.status === 404);
  }
  assert.throws(() => publicListingQuestion({ registry, seed: fixture().seed, input: { ...input, listingId: "MS-MISSING" } }), (error) => error.status === 404);
});

test("validates bounded input and registry locale without allowing source URLs or private context", () => {
  for (const bad of [null, [], { ...input, question: " " }, { ...input, question: "x".repeat(241) }, { ...input, locale: "fr" }, { ...input, listingId: "https://example.test" }, { ...input, leadId: "private" }]) {
    assert.throws(() => publicListingQuestion({ registry, seed: fixture().seed, input: bad }), (error) => error.status === 400);
  }
});

test("Next and Node responses share source, recovery and guard contracts", async () => {
  const { seed } = fixture();
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-listing-question-`);
  const cmsSeedPath = `${directory}/seed.json`; fs.writeFileSync(cmsSeedPath, JSON.stringify(seed));
  const config = { ...appApiConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), cmsSeedPath, rateLimit: null };
  const app = createHttpApp({ seed, rateLimit: null, listingEditLedgerPath: config.listingEditLedgerPath, mediaReviewLedgerPath: config.mediaReviewLedgerPath, mediaUploadLedgerPath: config.mediaUploadLedgerPath });
  const send = async (body, headers = {}) => {
    const common = { origin: "http://example.test", host: "example.test", "content-type": "application/json", ...headers };
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const next = await renderAppApiResponse(new Request(`http://example.test${LISTING_QUESTION_PATH}`, { method: "POST", headers: common, body: text }), { config });
    const node = await dispatchHttp(app, { url: LISTING_QUESTION_PATH, method: "POST", headers: common, body: text });
    const result = { status: next.status, body: await next.json() };
    assert.equal(node.status, result.status);
    if (result.status === 200) assert.deepEqual(node.body, result.body);
    assert.match(next.headers.get("cache-control"), /no-store/);
    assert.match(node.headers["cache-control"], /no-store/);
    return result;
  };
  assert.equal((await send(input)).body.status, "related_source");
  assert.equal((await send({ ...input, question: "lift" })).body.status, "no_answer");
  assert.equal((await send({ ...input, question: "x".repeat(241) })).status, 400);
  assert.equal((await send("{")).status, 400);
  assert.equal((await send(input, { origin: "https://untrusted.test" })).status, 403);
  assert.equal((await send("x".repeat(4097))).status, 413);
  for (const locale of registry.locales.filter((row) => row.public_enabled)) {
    const pathname = listingPath(registry, locale.code, input.listingId);
    const rendered = renderAppRoute({ pathname, config: { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), cmsSeedPath } });
    assert.match(rendered.html, /data-listing-question-form="true"/);
    assert.match(rendered.html, /maxlength="240"/i);
    if (locale.code === "he") assert.match(rendered.html, /dir="rtl"/);
  }
});

test("both public endpoints use the existing rate limiter", async () => {
  const { seed } = fixture();
  const rateLimit = { windowMs: 60000, max: 1 };
  const app = createHttpApp({ seed, rateLimit });
  const config = { ...appApiConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), rateLimit };
  for (const adapter of ["Next", "Node"]) {
    const send = async () => adapter === "Next"
      ? renderAppApiResponse(new Request(`http://example.test${LISTING_QUESTION_PATH}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://example.test", host: "example.test" }, body: JSON.stringify(input) }), { config })
      : dispatchHttp(app, { method: "POST", url: LISTING_QUESTION_PATH, headers: { origin: "http://example.test", host: "example.test" }, body: input });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 429);
  }
});
