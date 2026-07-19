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
  assert.equal(report.summary.matchable_leads_with_listing_reference, 1);
  assert.equal(report.summary.qualified_leads, 0);
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

test("qualified renter requirements drive inventory matching without a source listing", () => {
  const renter = {
    lead_id: "lead-renter-en",
    lead_type: "renter",
    listing_reference: null,
    original_language: "en",
    admin_locale: "en",
    assigned_broker: "broker_international",
  };
  const report = buildLeadMatchingReport({
    registry,
    seed,
    generatedAt: "2026-07-19T00:00:00Z",
    leads: [renter],
    leadPipelineStates: [
      {
        lead_id: renter.lead_id,
        pipeline: "renter",
        stage: "qualified",
        status: "open",
        requirements: {
          budget_min_eur: 0,
          budget_max_eur: 2000000,
          locations: ["Sandanski"],
          property_types: ["commercial"],
          bedrooms_min: null,
          timeline: "This month",
          finance_status: "not_applicable",
        },
      },
    ],
  });

  assert.equal(assertLeadMatchingReport(report), true);
  assert.equal(report.summary.active_matchable_leads, 1);
  assert.equal(report.summary.qualified_leads, 1);
  assert.equal(report.rows[0].source_listing_id, null);
  assert.equal(report.rows[0].qualification_complete, true);
  assert.equal(report.rows[0].criteria.offer_type, "rent");
  assert.ok(report.rows[0].matches.every((match) => match.offer_type === "rent"));
});
