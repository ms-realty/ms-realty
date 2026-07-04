import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHttpApp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

const leadLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-leads-")), "leads.jsonl");
resetLeadLedger(leadLedgerPath);
const server = createNodeServer(createHttpApp({ leadLedgerPath, receivedAt: "2026-07-04T00:00:00Z" }));
const address = await listen(server);
const baseUrl = `http://${address.address}:${address.port}`;

try {
  const smoke = {
    fixture_id: "node-server-smoke-20260704",
    baseUrl,
    listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
    search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
    sitemap: await textFetch(baseUrl, "/sitemap.xml"),
    robots: await textFetch(baseUrl, "/robots.txt"),
    lead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-he-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
      }),
    }),
    badLead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-bad-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "missing",
        contact: { name: "Noa Levi" },
      }),
    }),
    admin: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminUnauthorized: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru"),
  };
  assertServerSmoke(smoke);
  const ledger = readLeadLedger(leadLedgerPath);
  assertLeadLedger(ledger);
  smoke.leadLedger = { rows: ledger.length };
  const outPath = fromRoot("production", "data", "node-server-smoke.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
  console.log(`Wrote Node server smoke fixture to ${outPath}`);
} finally {
  await close(server);
}
