import test from "node:test";
import assert from "node:assert/strict";
import { createLeadDraft, normalizePublicLeadInput } from "../lib/leads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed, submitRuntimeLead } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();

test("lead intake normalizes buyer requirements and reports only genuinely missing qualification fields", () => {
  const lead = createLeadDraft(registry, {
    id: "lead-intake-complete",
    source: "website_consultation_request",
    intent: "consultation",
    leadType: "foreign_buyer",
    language: "en",
    contact: { name: "Noa", whatsapp: "+359880000001" },
    requirements: {
      budget_min_eur: "90000",
      budget_max_eur: "140000",
      locations: ["Sandanski", "Petrich", "Sandanski"],
      property_types: "apartment, house",
      timeline: "Within three months",
      finance_status: "cash",
    },
  });

  assert.equal(lead.contact_preference, "whatsapp");
  assert.deepEqual(lead.requirements, {
    budget_min_eur: 90000,
    budget_max_eur: 140000,
    locations: ["Sandanski", "Petrich"],
    property_types: ["apartment", "house"],
    bedrooms_min: null,
    timeline: "Within three months",
    finance_status: "cash",
  });
  assert.equal(lead.intake.complete, true);
  assert.deepEqual(lead.intake.missing_fields, []);
});

test("fast listing enquiries preserve reviewed listing context and create explicit qualification work", () => {
  const seed = loadCmsSeed();
  const record = seed.records.find((candidate) => candidate.collection === "listings");
  const result = submitRuntimeLead(registry, seed, {
    id: "lead-intake-listing",
    source: "website_listing_detail",
    leadType: "buyer",
    language: "en",
    listingReference: record.id,
    contact: { name: "Buyer", phone: "+359880000002" },
    message: "Please tell me more.",
  });

  assert.equal(result.lead.property.location, record.facts.location);
  assert.equal(result.lead.property.type, record.facts.property_type);
  assert.deepEqual(result.lead.requirements.locations, [record.facts.location]);
  assert.deepEqual(result.lead.requirements.property_types, [record.facts.property_type]);
  assert.equal(result.lead.intake.complete, false);
  assert.deepEqual(result.lead.intake.missing_fields, ["budget_max_eur", "timeline"]);
});

test("public consultation source accepts explicit operating segments but rejects spoofed types", () => {
  const consultation = normalizePublicLeadInput({
    source: "website_consultation_request",
    leadType: "investor",
    language: "de",
    contact: { name: "Investor", email: "investor@example.test" },
    "requirements.locations": "Sandanski",
    "requirements.budget_max_eur": "250000",
    "requirements.timeline": "This year",
  });
  assert.equal(consultation.intent, "consultation");
  assert.equal(consultation.leadType, "investor");
  assert.deepEqual(consultation.requirements.locations, ["Sandanski"]);
  assert.throws(
    () =>
      normalizePublicLeadInput({
        source: "website_seller_valuation",
        leadType: "investor",
        contact: { name: "Spoof", phone: "+359880000003" },
        property: { location: "Sandanski", type: "house" },
      }),
    /Lead type must match source/,
  );
});

test("unsupported internal lead segments are rejected before broker routing", () => {
  assert.throws(
    () =>
      createLeadDraft(registry, {
        source: "internal",
        leadType: "mystery",
        contact: { name: "Unknown", phone: "+359880000004" },
      }),
    /supported lead segment/,
  );
});
