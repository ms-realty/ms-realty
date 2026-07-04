import fs from "node:fs";
import path from "node:path";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, DEFAULT_LEAD_LEDGER_PATH, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { fromRoot } from "../lib/paths.mjs";

resetLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
const app = createHttpApp({ leadLedgerPath: DEFAULT_LEAD_LEDGER_PATH, receivedAt: "2026-07-04T00:00:00Z" });
const smoke = {
  fixture_id: "http-smoke-20260704",
  listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
  fallback: await dispatchHttp(app, { url: "/fr/" }),
  sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
  robots: await dispatchHttp(app, { url: "/robots.txt" }),
  lead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-he-0001",
      leadType: "buyer",
      language: "he",
      listingReference: "MS-CRAWL-0001",
      contact: { name: "Noa Levi" },
      message: "Interested in this property.",
    },
  }),
};

assertHttpSmoke(smoke);
const ledger = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
assertLeadLedger(ledger);
smoke.leadLedger = { path: DEFAULT_LEAD_LEDGER_PATH, rows: ledger.length };

const outPath = fromRoot("production", "data", "http-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote HTTP smoke fixture to ${outPath}`);
