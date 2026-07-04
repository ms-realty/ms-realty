import fs from "node:fs";
import path from "node:path";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

const server = createNodeServer();
const address = await listen(server);
const baseUrl = `http://${address.address}:${address.port}`;

try {
  const smoke = {
    fixture_id: "node-server-smoke-20260704",
    baseUrl,
    listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
    search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
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
  };
  assertServerSmoke(smoke);
  const outPath = fromRoot("production", "data", "node-server-smoke.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
  console.log(`Wrote Node server smoke fixture to ${outPath}`);
} finally {
  await close(server);
}
