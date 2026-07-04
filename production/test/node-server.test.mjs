import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

async function withServer(fn) {
  const server = createNodeServer();
  const address = await listen(server);
  try {
    return await fn(`http://${address.address}:${address.port}`);
  } finally {
    await close(server);
  }
}

test("Node server serves live listing, search, and lead endpoints", async () => {
  await withServer(async (baseUrl) => {
    const smoke = {
      listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
      search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
      lead: await jsonFetch(baseUrl, "/api/leads", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-lead-test",
          leadType: "buyer",
          language: "he",
          listingReference: "MS-CRAWL-0001",
          contact: { name: "Noa Levi" },
        }),
      }),
      badLead: await jsonFetch(baseUrl, "/api/leads", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-bad-lead-test",
          leadType: "buyer",
          language: "he",
          listingReference: "missing",
          contact: { name: "Noa Levi" },
        }),
      }),
    };
    assert.equal(assertServerSmoke(smoke), true);
  });
});

test("generated Node server smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "node-server-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertServerSmoke(smoke), true);
});
