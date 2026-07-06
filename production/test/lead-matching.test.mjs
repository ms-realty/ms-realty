import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLeadMatchingReport, assertLeadMatchingReport } from "../lib/lead-matching.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

test("lead matching report creates broker inventory tasks from buyer listing references", () => {
  const report = buildLeadMatchingReport({
    registry,
    seed,
    generatedAt: "2026-07-05T00:00:00Z",
    leads: [
      {
        lead_id: "lead-buyer-he",
        lead_type: "buyer",
        listing_reference: "MS-CRAWL-0001",
        original_language: "he",
        admin_locale: "en",
        assigned_broker: "broker_international",
      },
      {
        lead_id: "lead-seller-el",
        lead_type: "seller",
        listing_reference: "MS-CRAWL-0001",
        original_language: "el",
        admin_locale: "en",
        assigned_broker: "broker_international",
      },
    ],
  });

  assert.equal(assertLeadMatchingReport(report), true);
  assert.equal(report.summary.buyer_leads_with_listing_reference, 1);
  assert.equal(report.summary.open_broker_tasks, 1);
  assert.equal(report.rows[0].criteria.location, "Sandanski");
  assert.equal(report.rows[0].criteria.property_type, "commercial");
  assert.equal(report.rows[0].matches.some((match) => match.listing_id === "MS-CRAWL-0001"), false);
  assert.equal(report.rows[0].broker_task.owner, "broker_international");
});

test("generated lead matching report is valid when present", () => {
  const file = fromRoot("production", "data", "lead-matching-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertLeadMatchingReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
