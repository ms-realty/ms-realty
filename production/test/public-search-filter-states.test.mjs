import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRouterConfigFromEnv, renderAppSearchRouteResponse } from "../lib/app-router-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const config = () => appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() });

async function search(query, { accept = "text/html,application/xhtml+xml" } = {}) {
  const response = await renderAppSearchRouteResponse({
    pathname: "/bg/tarsene",
    url: `https://example.test/bg/tarsene${query}`,
    accept,
    config: config(),
  });
  return { response, body: await response.text() };
}

test("a reversed price range answers with the search page, not a JSON error", async () => {
  const { response, body } = await search("?price_min=200000&price_max=100000");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  // The visitor's mistake must not be cached for the next visitor.
  assert.equal(response.headers.get("cache-control"), "no-store");

  // The page names the pair of boxes that disagree, in the visitor's language.
  assert.match(body, /data-search-filter-notice="range"/);
  assert.equal((body.match(/data-search-more-filters="true" open/g) || []).length, 2);
  assert.match(body, /Цена \(EUR\): Минимумът е по-голям от максимума/);

  // Both boxes keep what was typed, so the correction is one keystroke away,
  // and both are announced as invalid and pointed at the notice.
  assert.match(body, /id="sr-price_min"[^>]*value="200000"/);
  assert.match(body, /id="sr-price_max"[^>]*value="100000"/);
  assert.equal((body.match(/aria-describedby="sr-filter-notice"/g) || []).length, 4);
  assert.match(body, /id="sr-price_min"[^>]*aria-invalid="true"/);

  // The results below are the honest ones: the pair that could not be honoured
  // is dropped rather than silently applied in some other order.
  assert.doesNotMatch(body, /data-filter-chip="price_min"/);
  assert.match(body, /data-search-results="true"/);
});

test("a non-numeric filter value is reported as a value the boxes cannot take", async () => {
  const { response, body } = await search("?price_min=abc");

  assert.equal(response.status, 200);
  assert.match(body, /data-search-filter-notice="value"/);
  assert.match(body, /Цена \(EUR\): Приемаме само число/);
  assert.match(body, /id="sr-price_min"[^>]*value="abc"/);
});

test("a reversed area range keeps every other filter the visitor set", async () => {
  const { body } = await search("?offer_type=sale&area_min=500&area_max=10");

  assert.match(body, /data-search-filter-notice="range"/);
  assert.match(body, /data-filter-chip="offer_type"/);
  assert.doesNotMatch(body, /data-filter-chip="area_min"/);
});

test("a client that did not ask for HTML still gets the JSON error contract", async () => {
  const { response, body } = await search("?price_min=200000&price_max=100000", { accept: "application/json" });

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(JSON.parse(body), { kind: "bad_request", message: "price_min cannot exceed price_max" });
});

test("an empty result names the range to widen and the count it promises is real", async () => {
  const { response, body } = await search("?price_min=100000000&price_max=200000000");

  assert.equal(response.status, 200);
  assert.match(body, /data-search-empty="true"/);
  assert.match(body, /data-search-widen="true"/);

  const suggestion = body.match(/<a href="([^"]*)">Цена \(EUR\): (\d+) съвпадения<\/a>/);
  assert.ok(suggestion, "the empty state offers the price range as the one to widen");

  // Following the offer has to return the number the offer printed, or the
  // empty state is guessing at the visitor's behalf.
  const promised = Number(suggestion[2]);
  assert.ok(promised > 0);
  const widened = await search(new URL(suggestion[1], "https://example.test").search);
  assert.match(widened.body, new RegExp(`<p class="sr-results__count"[^>]*>${promised} съвпадения</p>`));
});

// The Next route and the node origin each normalize the query on their own, so
// the rule has to hold in both. A visitor cannot tell which one served them.
test("the node origin recovers from a reversed range the same way", async () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-search-states-"));
  const copy = (name) => {
    const target = path.join(dataDir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  const app = createHttpApp({
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-search-filter-states-key-32c",
  });

  const page = await dispatchHttp(app, { url: "/bg/tarsene?price_min=200000&price_max=100000", headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  assert.match(page.body, /data-search-filter-notice="range"/);
  assert.match(page.body, /id="sr-price_min"[^>]*value="200000"/);

  // The JSON contract of /api/search is untouched by the page's recovery.
  const api = await dispatchHttp(app, { url: "/api/search?locale=bg&price_min=200000&price_max=100000" });
  assert.equal(api.status, 400);
  // dispatchHttp hands JSON routes their parsed body already.
  const apiBody = typeof api.body === "string" ? JSON.parse(api.body) : api.body;
  assert.equal(apiBody.message, "price_min cannot exceed price_max");
});
