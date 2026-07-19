import fs from "node:fs";
import path from "node:path";
import { listingToPublicViewModel } from "./content.mjs";
import { readLeadLedger } from "./lead-ledger.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, searchRuntimeListings } from "./runtime.mjs";

export const DEFAULT_LEAD_MATCHING_REPORT = fromRoot("production", "data", "lead-matching-report.json");
const MATCHABLE_LEAD_TYPES = new Set(["buyer", "foreign_buyer", "investor", "renter"]);

function sourceFilters(view) {
  return Object.fromEntries(
    Object.entries({
      location: view.location,
      property_type: view.property_type,
      offer_type: view.offer_type,
    }).filter(([, value]) => value),
  );
}

function qualifiedFilterSets(state, fallbackFilters = {}) {
  const requirements = state?.requirements;
  if (!requirements) return [fallbackFilters];
  const locations = requirements.locations?.length ? requirements.locations : [fallbackFilters.location].filter(Boolean);
  const propertyTypes = requirements.property_types?.length ? requirements.property_types : [fallbackFilters.property_type].filter(Boolean);
  const offerType = state.pipeline === "renter" ? "rent" : "sale";
  const common = Object.fromEntries(
    Object.entries({
      offer_type: offerType,
      price_max: requirements.budget_max_eur,
      bedrooms_min: requirements.bedrooms_min,
    }).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
  const locationValues = locations.length ? locations : [null];
  const typeValues = propertyTypes.length ? propertyTypes : [null];
  return locationValues.flatMap((location) =>
    typeValues.map((propertyType) => ({
      ...common,
      ...(location ? { location } : {}),
      ...(propertyType ? { property_type: propertyType } : {}),
    })),
  );
}

function matchLead(registry, seed, listingById, lead, pipelineState) {
  const sourceListing = listingById.get(lead.listing_reference);
  if (!sourceListing && !pipelineState?.requirements) return null;
  const view = sourceListing ? sourceListing.facts || listingToPublicViewModel(sourceListing) : {};
  const fallbackFilters = sourceFilters(view);
  const filterSets = qualifiedFilterSets(pipelineState, fallbackFilters);
  const matchesById = new Map();
  for (const filters of filterSets) {
    const search = searchRuntimeListings(registry, seed, {
      localeCode: lead.original_language || lead.admin_locale || registry.source_locale,
      query: "",
      filters,
      pageSize: 24,
      translationTasks: [],
    });
    for (const card of search.cards) {
      if (card.id !== lead.listing_reference && !matchesById.has(card.id)) matchesById.set(card.id, card);
    }
  }
  const matches = [...matchesById.values()].slice(0, 5);
  const criteria = pipelineState?.requirements
    ? {
        locations: pipelineState.requirements.locations,
        property_types: pipelineState.requirements.property_types,
        offer_type: pipelineState.pipeline === "renter" ? "rent" : "sale",
        price_max: pipelineState.requirements.budget_max_eur,
        bedrooms_min: pipelineState.requirements.bedrooms_min,
      }
    : fallbackFilters;

  return {
    lead_id: lead.lead_id,
    lead_type: lead.lead_type,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    assigned_broker: lead.assigned_broker,
    source_listing_id: lead.listing_reference || null,
    pipeline_stage: pipelineState?.stage || null,
    qualification_complete: Boolean(pipelineState?.requirements),
    criteria,
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
  leadPipelineStates = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const listingById = new Map(seed.records.map((record) => [record.id, record]));
  const stateByLeadId = new Map(leadPipelineStates.map((state) => [state.lead_id, state]));
  const rows = leads
    .filter((lead) => MATCHABLE_LEAD_TYPES.has(lead.lead_type) && (lead.listing_reference || stateByLeadId.get(lead.lead_id)?.requirements))
    .filter((lead) => !["lost", "closed"].includes(stateByLeadId.get(lead.lead_id)?.status))
    .map((lead) => matchLead(registry, seed, listingById, lead, stateByLeadId.get(lead.lead_id)))
    .filter(Boolean);

  return {
    generated_at: generatedAt,
    summary: {
      matchable_leads_with_listing_reference: rows.filter((row) => row.source_listing_id).length,
      active_matchable_leads: rows.length,
      qualified_leads: rows.filter((row) => row.qualification_complete).length,
      leads_with_matches: rows.filter((row) => row.match_count > 0).length,
      open_broker_tasks: rows.filter((row) => row.broker_task?.status === "open").length,
    },
    rows,
  };
}

export function assertLeadMatchingReport(report) {
  const rowsWithSource = report.rows.filter((row) => row.source_listing_id).length;
  if (report.summary.matchable_leads_with_listing_reference !== rowsWithSource) {
    throw new Error("Lead matching source-listing summary must match rows");
  }
  if (report.summary.active_matchable_leads !== report.rows.length) {
    throw new Error("Lead matching active summary must match rows");
  }
  if (report.summary.qualified_leads !== report.rows.filter((row) => row.qualification_complete).length) {
    throw new Error("Lead matching qualification summary must match rows");
  }
  if (report.summary.leads_with_matches !== report.rows.filter((row) => row.match_count > 0).length) {
    throw new Error("Lead matching matched summary must match rows");
  }
  for (const row of report.rows) {
    if (!row.lead_id || (!row.source_listing_id && !row.pipeline_stage) || !row.assigned_broker) {
      throw new Error("Lead matching rows must preserve lead criteria and broker assignment");
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
