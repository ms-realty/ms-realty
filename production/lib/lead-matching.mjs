import fs from "node:fs";
import path from "node:path";
import { listingToPublicViewModel } from "./content.mjs";
import { readLeadLedger } from "./lead-ledger.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, searchRuntimeListings } from "./runtime.mjs";

export const DEFAULT_LEAD_MATCHING_REPORT = fromRoot("production", "data", "lead-matching-report.json");

function sourceFilters(view) {
  return Object.fromEntries(
    Object.entries({
      location: view.location,
      property_type: view.property_type,
      offer_type: view.offer_type,
    }).filter(([, value]) => value),
  );
}

function matchLead(registry, seed, listingById, lead) {
  const sourceListing = listingById.get(lead.listing_reference);
  if (!sourceListing) return null;
  const view = sourceListing.facts || listingToPublicViewModel(sourceListing);
  const filters = sourceFilters(view);
  const search = searchRuntimeListings(registry, seed, {
    localeCode: lead.original_language || lead.admin_locale || registry.source_locale,
    query: "",
    filters,
    translationTasks: [],
  });
  const matches = search.cards.filter((card) => card.id !== lead.listing_reference).slice(0, 5);

  return {
    lead_id: lead.lead_id,
    lead_type: lead.lead_type,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    assigned_broker: lead.assigned_broker,
    source_listing_id: lead.listing_reference,
    criteria: filters,
    match_count: matches.length,
    matches: matches.map((card) => ({
      listing_id: card.id,
      path: card.path,
      title: card.title,
      location: card.location,
      property_type: card.property_type,
      offer_type: card.offer_type,
      price_eur: card.price_eur,
      price_on_request: card.price_on_request,
    })),
    broker_task:
      matches.length > 0
        ? {
            id: `inventory-match-${lead.lead_id}`,
            status: "open",
            owner: lead.assigned_broker || "broker_assignment",
            action: "review_matching_inventory",
          }
        : null,
  };
}

export function buildLeadMatchingReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  leads = readLeadLedger(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const listingById = new Map(seed.records.map((record) => [record.id, record]));
  const rows = leads
    .filter((lead) => lead.lead_type === "buyer" && lead.listing_reference)
    .map((lead) => matchLead(registry, seed, listingById, lead))
    .filter(Boolean);

  return {
    generated_at: generatedAt,
    summary: {
      buyer_leads_with_listing_reference: rows.length,
      leads_with_matches: rows.filter((row) => row.match_count > 0).length,
      open_broker_tasks: rows.filter((row) => row.broker_task?.status === "open").length,
    },
    rows,
  };
}

export function assertLeadMatchingReport(report) {
  if (report.summary.buyer_leads_with_listing_reference !== report.rows.length) {
    throw new Error("Lead matching summary must match rows");
  }
  if (report.summary.leads_with_matches !== report.rows.filter((row) => row.match_count > 0).length) {
    throw new Error("Lead matching matched summary must match rows");
  }
  for (const row of report.rows) {
    if (!row.lead_id || !row.source_listing_id || !row.assigned_broker) {
      throw new Error("Lead matching rows must preserve lead, source listing, and broker assignment");
    }
    if ("contact" in row || "email" in row || "phone" in row) throw new Error("Lead matching rows must not store raw contact data");
    if (row.match_count !== row.matches.length) throw new Error("Lead matching count must match listed inventory rows");
    if (row.match_count > 0 && row.broker_task?.status !== "open") {
      throw new Error("Lead matching rows with inventory must create an open broker task");
    }
  }
  return true;
}

export function writeLeadMatchingReport(report, filePath = DEFAULT_LEAD_MATCHING_REPORT) {
  assertLeadMatchingReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
