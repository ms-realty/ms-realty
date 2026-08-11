import crypto from "node:crypto";
import { buildApprovedSearchProjection } from "./search-engine-sync.mjs";
import { loadPayloadCmsImportRuntime } from "./payload-cms-import.mjs";

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
    Boolean(text(translation?.reviewer)) &&
    Boolean(translation?.approved_at) &&
    !Number.isNaN(Date.parse(translation.approved_at))
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

function rowFor(listing, translation) {
  const locale = objectRelation(translation.locale);
  const sourceLocale = objectRelation(listing.source_locale);
  const property = objectRelation(listing.property);
  const location = objectRelation(listing.location) || objectRelation(property?.location);
  const listingId = text(listing.id);
  const localeCode = text(locale?.code);
  if (!listingId || !localeCode || !property || !location) throw new Error(`Published listing ${listingId || "unknown"} has incomplete search relations`);

  const listingFacts = listing.facts || {};
  const propertyFacts = property.facts || {};
  const localePath =
    listing.routing?.target_locale === localeCode && text(listing.routing?.target_path)
      ? text(listing.routing.target_path)
      : `/${localeCode}/imoti/${encodeURIComponent(listingId)}`;
  return {
    listing: {
      ...listingFacts,
      ...propertyFacts,
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
      bedrooms_count: listingFacts.bedrooms,
      floor_number: listingFacts.floor,
      total_floors: listingFacts.total_floors,
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

export function payloadListingSearchRows(listings = []) {
  const rows = [];
  for (const listing of listings) {
    if (listing?.cms_status !== "published" || listing?.workflow?.publish_approved !== true) continue;
    const sourceLocale = text(objectRelation(listing.source_locale)?.code);
    // ponytail: translation rows currently store approval metadata, not localized copy; index only the source locale until copy fields exist.
    for (const translation of Array.isArray(listing.translations) ? listing.translations : []) {
      if (!publishedTranslation(translation) || text(objectRelation(translation.locale)?.code) !== sourceLocale) continue;
      rows.push(rowFor(listing, translation));
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
      depth: 2,
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

export async function buildPayloadApprovedSearchProjection(payload, { pageSize = 100 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Payload search projection pageSize is invalid");
  const listings = await approvedListings(payload, pageSize);
  const rows = payloadListingSearchRows(listings);
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
