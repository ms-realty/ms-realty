import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("HTTP app serves listing, search, fallback, and lead JSON contracts", async () => {
  const app = createHttpApp();
  const smoke = {
    listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
    fallback: await dispatchHttp(app, { url: "/fr/" }),
    lead: await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      body: {
        id: "http-lead-test",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
        message: "Interested in this property.",
      },
    }),
  };

  assert.equal(assertHttpSmoke(smoke), true);
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.search.body.cards.length > 0, true);
});

test("HTTP app rejects unknown buyer listing references", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "bad-lead-test",
      leadType: "buyer",
      language: "he",
      listingReference: "missing",
      contact: { name: "Noa Levi" },
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /known listingReference/);
});

test("generated HTTP smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "http-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertHttpSmoke(smoke), true);
});
