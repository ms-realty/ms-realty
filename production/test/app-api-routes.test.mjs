import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { resetSellerPipeline } from "../lib/seller-pipeline.mjs";

function tempLedger(prefix, reset) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  reset(file);
  return file;
}

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Next API routes reuse health, readiness, search, and lead HTTP contracts", async () => {
  const eventLedgerPath = tempLedger("app-api-events", resetEventLedger);
  const leadLedgerPath = tempLedger("app-api-leads", resetLeadLedger);
  const sellerPipelinePath = tempLedger("app-api-seller-pipeline", resetSellerPipeline);
  await withEnv(
    {
      MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
      MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
      MS_REALTY_SELLER_PIPELINE_PATH: sellerPipelinePath,
    },
    async () => {
      const healthRoute = await import("../../app/api/health/route.js");
      const readyRoute = await import("../../app/api/ready/route.js");
      const searchRoute = await import("../../app/api/search/route.js");
      const leadRoute = await import("../../app/api/leads/route.js");

      const health = await healthRoute.GET(new Request("https://example.test/api/health"));
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, "ok");

      const ready = await readyRoute.GET(new Request("https://example.test/api/ready"));
      assert.equal(ready.status, 503);
      assert.equal((await ready.json()).status, "blocked");

      const search = await searchRoute.GET(new Request("https://example.test/api/search?locale=he&q=Sandanski"));
      const searchBody = await search.json();
      assert.equal(search.status, 200);
      assert.equal(searchBody.kind, "search");
      assert.equal(searchBody.search.query, "Sandanski");
      assert.ok(searchBody.search.total_matches > 0);

      const lead = await leadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-api-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi" },
            contact_preference: "whatsapp",
            message: "Interested in this property.",
          }),
        }),
      );
      const leadBody = await lead.json();
      assert.equal(lead.status, 201);
      assert.equal(lead.headers.get("cache-control"), "no-store");
      assert.equal(leadBody.lead.listingReference, "MS-CRAWL-0001");
    },
  );

  assert.equal(readLeadLedger(leadLedgerPath).length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "search").length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "lead_submitted").length, 1);
});
