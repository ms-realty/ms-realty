import crypto from "node:crypto";
import { publishedListingTranslationCopy } from "./content.mjs";
import { buildApprovedSearchProjection } from "./search-engine-sync.mjs";
import { loadPayloadCmsImportRuntime } from "./payload-cms-import.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadListingPublicationApproval } from "./listing-publication-approval.mjs";
import { listingPath } from "./seo.mjs";

function objectRelation(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function publishedTranslation(translation) {
  const locale = objectRelation(translation?.locale);
  return (
    locale?.public_enabled === true &&
    locale?.indexable === true &&
    translation?.status === "published" &&
    translation?.translation_state === "published" &&
    translation?.public_indexable === true &&
    Boolean(publishedListingTranslationCopy(translation))
  );
}

function verified(field) {
  return { field, state: "broker_verified", source_type: "payload_human_approval", source_reference: "listing_workflow" };
}

function listingFactVerifications(listing, property) {
  const result = [...(Array.isArray(property?.fact_verification) ? property.fact_verification : [])];
  const facts = listing.facts || {};
  const workflow = listing.workflow || {};
  for (const field of ["listing_status", "offer_type"]) if (facts[field] !== undefined) result.push(verified(field));
  if (workflow.price_verified_at && workflow.price_verified_by && facts.price_eur !== undefined) result.push(verified("price_amount"));
  if (workflow.price_on_request_verified_at && workflow.price_on_request_verified_by) result.push(verified("price_on_request"));
  if (workflow.location_verified_at && workflow.location_verified_by) {
    for (const field of ["location_id", "location_label", "public_latitude", "public_longitude", "public_location_precision"]) result.push(verified(field));
  }
  return result;
}

// The locale's own listing segment — properties in English, immobilien in
// German, imoti in Bulgarian — from the same route map the site renders links
// with. Hardcoding one locale's segment here sent every locale's search results
// to Bulgarian URLs, so /en/search linked to /bg/imoti/*.
function localeListingPath(registry, localeCode, listingId) {
  try {
    return listingPath(registry, localeCode, encodeURIComponent(listingId));
  } catch {
    // A locale the registry does not know cannot be given a route. Refusing is
    // the honest answer; a guessed segment is a broken link nobody notices.
    throw new Error(`Published listing ${listingId} has no route for locale ${localeCode}`);
  }
}

function rowFor(listing, translation, registry) {
  const locale = objectRelation(translation.locale);
  const sourceLocale = objectRelation(listing.source_locale);
  const property = objectRelation(listing.property);
  const location = objectRelation(listing.location) || objectRelation(property?.location);
  const listingId = text(listing.id);
  const localeCode = text(locale?.code);
  if (!listingId || !localeCode || !property || !location) throw new Error(`Published listing ${listingId || "unknown"} has incomplete search relations`);

  const listingFacts = listing.facts || {};
  const propertyFacts = property.facts || {};
  const copy = publishedListingTranslationCopy(translation);
  if (!copy) throw new Error(`Published listing ${listingId} has invalid translated copy for ${localeCode}`);
  const localePath =
    listing.routing?.target_locale === localeCode && text(listing.routing?.target_path)
      ? text(listing.routing.target_path)
      : localeListingPath(registry, localeCode, listingId);
  return {
    listing: {
      ...listingFacts,
      ...propertyFacts,
      title: copy.title,
      h1: copy.title,
      description: copy.description,
      seo_title: copy.seo_title,
      meta_description: copy.meta_description,
      id: listingId,
      source_listing_id: listingId,
      listing_reference: listingId,
      locale: localeCode,
      locale_path: localePath,
      property_family: property.property_family,
      property_subtype: property.property_subtype,
      location_id: text(location.id),
      location_label: text(location.label),
      public_latitude: location.public_latitude,
      public_longitude: location.public_longitude,
      public_location_precision: location.public_location_precision,
      price_amount: listingFacts.price_eur,
      price_currency: listingFacts.price_eur === null || listingFacts.price_eur === undefined ? undefined : "EUR",
      price_on_request: listingFacts.price_on_request,
      bedrooms_count: listingFacts.bedrooms ?? propertyFacts.bedrooms_count,
      floor_number: listingFacts.floor ?? propertyFacts.floor_number,
      total_floors: listingFacts.total_floors ?? propertyFacts.total_floors,
    },
    approval: {
      publication_state: "published",
      translation_human_approved: true,
      locale_indexable: true,
      locale: localeCode,
      fact_verification: listingFactVerifications(listing, property),
      has_approved_tour: listing.tour?.is_public === true && listing.tour?.review_status === "published",
    },
    source_locale: text(sourceLocale?.code),
  };
}

export function payloadListingSearchRows(listings = [], { registry = loadLocaleRegistry(), publicationEvidence = null, onSkipped = null } = {}) {
  // The public boundary serves only listings the owner's publication approval
  // NAMES; the index must agree with the boundary or search links point at
  // pages the site refuses to serve. A published row the approval excludes is
  // skipped with its recorded reason, not indexed and not fatal.
  const named = publicationEvidence && Array.isArray(publicationEvidence.listing_ids) ? new Set(publicationEvidence.listing_ids) : null;
  const excluded = new Map(
    (publicationEvidence?.excluded_listings || []).map((entry) => [text(entry?.id), text(entry?.reason) || "excluded by the publication approval"]),
  );
  const rows = [];
  for (const listing of listings) {
    if (listing?.cms_status !== "published" || listing?.workflow?.publish_approved !== true) continue;
    const id = text(listing.id);
    if (named && !named.has(id)) {
      if (typeof onSkipped === "function") onSkipped({ listing_id: id, reason: excluded.get(id) || "not named by the publication approval" });
      continue;
    }
    for (const translation of Array.isArray(listing.translations) ? listing.translations : []) {
      if (!publishedTranslation(translation)) continue;
      rows.push(rowFor(listing, translation, registry));
    }
  }
  return rows;
}

async function approvedListings(payload, pageSize) {
  if (!payload || typeof payload.find !== "function") throw new Error("Payload search projection requires Payload Local API");
  const docs = [];
  for (let page = 1; ; page += 1) {
    const result = await payload.find({
      collection: "listings",
      depth: 3,
      draft: true,
      limit: pageSize,
      overrideAccess: true,
      page,
      sort: "id",
      where: {
        and: [
          { cms_status: { equals: "published" } },
          { "workflow.publish_approved": { equals: true } },
        ],
      },
    });
    docs.push(...(result.docs || []));
    if (page >= Number(result.totalPages || 1)) break;
  }
  return docs;
}

export async function buildPayloadApprovedSearchProjection(payload, { pageSize = 100, registry = loadLocaleRegistry(), publicationEvidence = loadListingPublicationApproval(), onSkipped = null } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Payload search projection pageSize is invalid");
  const listings = await approvedListings(payload, pageSize);
  const skipped = [];
  const rows = payloadListingSearchRows(listings, {
    registry,
    publicationEvidence,
    onSkipped: (entry) => {
      skipped.push(entry);
      if (typeof onSkipped === "function") onSkipped(entry);
    },
  });
  const projection = buildApprovedSearchProjection(rows);
  projection.documents.sort((left, right) => left.id.localeCompare(right.id));
  const digest = crypto.createHash("sha256").update(JSON.stringify(projection.documents)).digest("hex");
  return {
    ...projection,
    source: {
      kind: "payload_postgres",
      authoritative: true,
      listing_rows: listings.length,
      eligible_translation_rows: rows.length,
      projected_documents: projection.documents.length,
      skipped_by_publication_approval: skipped,
      locale_codes: [...new Set(projection.documents.map((document) => document.locale))].sort(),
      digest,
    },
  };
}

export async function loadPayloadApprovedSearchProjection({ env = process.env, payload = null, pageSize = 100 } = {}) {
  const runtime = await loadPayloadCmsImportRuntime({ env, payload });
  try {
    return await buildPayloadApprovedSearchProjection(runtime, { pageSize });
  } finally {
    if (!payload) await runtime.destroy?.();
  }
}
