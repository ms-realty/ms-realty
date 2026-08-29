import fs from "node:fs";
import path from "node:path";
import { CANONICAL_PROPERTY_FAMILIES, isFactApplicable, PROPERTY_FIELD_REGISTRY } from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PAYLOAD_COLLECTIONS_OUTPUT = fromRoot("production", "data", "payload-collections.json");

function propertyFamiliesForFact(name) {
  if (!PROPERTY_FIELD_REGISTRY[name]) return null;
  return CANONICAL_PROPERTY_FAMILIES.filter((family) => isFactApplicable(family, name));
}

const GROUP_FIELDS = {
  facts: [
    ["title", "text"],
    ["h1", "text"],
    ["description", "textarea"],
    ["location", "text"],
    ["location_native", "text"],
    ["location_legacy", "text"],
    ["municipality", "text"],
    ["municipality_code", "text"],
    ["district", "text"],
    ["district_code", "text"],
    ["region", "text"],
    ["region_id", "text"],
    ["country_code", "text"],
    ["geography_id", "text"],
    ["geography_path", "json"],
    ["settlement_ekatte", "text"],
    ["location_review_status", "text"],
    ["location_precision", "text"],
    ["property_type", "text"],
    ["offer_type", "text"],
    {
      name: "listing_status",
      type: "select",
      options: ["available", "reserved", "sold", "rented", "archived"],
    },
    ["bedrooms", "number"],
    ["bedrooms_not_applicable", "checkbox"],
    ["price_eur", "number"],
    ["price_on_request", "checkbox"],
    ["image_count", "number"],
    ["area_sqm", "number"],
    ["floor", "number"],
    ["total_floors", "number"],
    ["land_area_sqm", "number"],
    ["condition", "text"],
  ],
  seo: [
    ["title", "text"],
    ["description", "textarea"],
    ["og_title", "text"],
    ["og_description", "textarea"],
    ["canonical", "text"],
    ["canonical_override", "text"],
    {
      name: "robots",
      type: "select",
      options: ["index,follow", "noindex,follow"],
    },
    ["schema_present", "checkbox"],
  ],
  workflow: [
    ["availability_verified_at", "date"],
    ["availability_verified_by", "text"],
    ["location_verified_at", "date"],
    ["location_verified_by", "text"],
    ["price_verified_at", "date"],
    ["price_verified_by", "text"],
    ["price_on_request_verified_at", "date"],
    ["price_on_request_verified_by", "text"],
    ["publish_approved", "checkbox"],
    ["publish_approved_at", "date"],
    ["publish_approved_by", "text"],
    ["last_edited_at", "date"],
    ["last_editor", "text"],
    ["last_edit_event", "json"],
  ],
  routing: [
    ["target_path", "text"],
    ["target_locale", "text"],
    ["planned_status", "number"],
    ["deployable", "checkbox"],
    ["review_required", "checkbox"],
  ],
  migration: [
    ["record_id", "text"],
    ["review_state", "text"],
    ["metadata_gaps", "json"],
  ],
  "properties.facts": [
    ["legacy_property_type", "text"],
    ["location_id", "text"],
    ["location_label", "text"],
    ["municipality", "text"],
    ["district", "text"],
    ["region_id", "text"],
    ["country_code", "text"],
    ["geography_id", "text"],
    ["geography_path", "json"],
    ["condition", "text"],
    ["construction_status", "text"],
    ["parking_kind", "text"],
    ["living_area_sqm", "number"],
    ["built_area_sqm", "number"],
    ["usable_area_sqm", "number"],
    ["gross_floor_area_sqm", "number"],
    ["land_area_sqm", "number"],
    ["bedrooms_count", "number"],
    ["premises_count", "number"],
    ["hotel_room_count", "number"],
    ["floor_number", "number"],
    ["total_floors", "number"],
    ["storeys_count", "number"],
    ["zoning_status", "text"],
    ["utilities_status", "text"],
    ["road_access_status", "text"],
    ["land_category", "text"],
    ["permanent_use", "text"],
    ["permitted_use", "text"],
    ["public_location_precision", "text"],
    ["primary_area_sqm", "number"],
  ].map(([name, type]) => ({
    name,
    type,
    custom: { property_families: propertyFamiliesForFact(name) },
  })),
};

function arrayFieldsFor(field) {
  if (field.name === "fallback_gallery") {
    return [
      { name: "url", type: "text" },
      { name: "alt", type: "text", localized: true },
    ];
  }
  if (field.name === "fact_verification") {
    return [
      { name: "field", type: "text", required: true },
      {
        name: "state",
        type: "select",
        required: true,
        options: ["unknown", "not_applicable", "entered_pending_review", "broker_verified"],
      },
      { name: "source_type", type: "text" },
      { name: "source_reference", type: "text" },
    ];
  }
  return [{ name: "value", type: "json" }];
}

function cleanField(field, collectionSlug) {
  const { required_when: requiredWhen, records, source, ...rest } = field;
  const payloadField = {
    ...rest,
    type: field.type === "url" ? "text" : field.type,
  };
  if (field.type === "url") {
    payloadField.admin = {
      ...(payloadField.admin || {}),
      description: payloadField.admin?.description || "URL field from migration manifest.",
    };
  }
  if (requiredWhen) {
    payloadField.admin = {
      ...(payloadField.admin || {}),
      description: `Required before: ${requiredWhen.join(", ")}`,
    };
  }
  if (payloadField.type === "group") {
    payloadField.fields = (GROUP_FIELDS[`${collectionSlug}.${field.name}`] || GROUP_FIELDS[field.name] || (field.fields || []).map((name) => [name, "text"])).map(
      (definition) => (Array.isArray(definition) ? { name: definition[0], type: definition[1] } : definition),
    );
  }
  if (payloadField.type === "array") {
    payloadField.fields = arrayFieldsFor(field);
  }
  return payloadField;
}

export function buildPayloadCollections(manifest) {
  return {
    artifact_id: "payload-collections-20260730",
    source_artifact: manifest.artifact_id,
    generated_from: "production/data/cms-collections.json",
    taxonomy_contract: manifest.taxonomy_contract,
    collections: manifest.collections.map((collection) => ({
      slug: collection.slug,
      admin: {
        useAsTitle:
          collection.slug === "locations"
            ? "label"
            : collection.slug === "listing_enrichment_tasks" || collection.slug === "search_outbox"
              ? "idempotency_key"
              : collection.slug === "listings"
                ? "id"
                : collection.fields[0]?.name || "id",
        defaultColumns: collection.fields.slice(0, 4).map((field) => field.name),
      },
      versions: collection.versions === false
        ? false
        : { drafts: true, ...(collection.slug === "listings" ? { maxPerDoc: 0 } : {}) },
      labels: {
        singular: collection.slug.replaceAll("_", " "),
        plural: collection.slug.replaceAll("_", " "),
      },
      fields: collection.fields.map((field) => cleanField(field, collection.slug)),
      custom: {
        source: collection.source,
        workflow: collection.workflow,
        publish_requires_human_review: collection.publish_requires_human_review,
      },
    })),
  };
}

export function assertPayloadCollections(config) {
  if (!config.taxonomy_contract?.version || !Array.isArray(config.taxonomy_contract.mappings)) {
    throw new Error("Payload collection config must retain the versioned property taxonomy contract");
  }
  const slugs = config.collections.map((collection) => collection.slug);
  for (const slug of [
    "listings",
    "properties",
    "locations",
    "listing_translations",
    "media_assets",
    "listing_tours",
    "listing_enrichment_tasks",
    "search_outbox",
  ]) {
    if (!slugs.includes(slug)) throw new Error(`Missing Payload collection config: ${slug}`);
  }
  for (const collection of config.collections) {
    if (!collection.admin?.useAsTitle || (collection.versions !== false && !collection.versions?.drafts)) {
      throw new Error(`Payload collection is missing admin/draft config: ${collection.slug}`);
    }
    if (collection.custom?.publish_requires_human_review !== true) {
      throw new Error(`Payload collection must keep human review gate: ${collection.slug}`);
    }
    if (!Array.isArray(collection.fields) || collection.fields.some((field) => !field.name || !field.type)) {
      throw new Error(`Payload collection has invalid fields: ${collection.slug}`);
    }
    const hasUnadaptedManifestField = collection.fields.some(
      (field) => field.type === "url" || (Array.isArray(field.fields) && field.fields.some((item) => typeof item === "string")),
    );
    if (hasUnadaptedManifestField) {
      throw new Error(`Payload collection contains unadapted manifest fields: ${collection.slug}`);
    }
  }
  const translations = config.collections.find((collection) => collection.slug === "listing_translations");
  const translationFields = new Map((translations?.fields || []).map((field) => [field.name, field]));
  for (const [name, type] of [
    ["title", "text"],
    ["description", "textarea"],
    ["seo_title", "text"],
    ["meta_description", "textarea"],
    ["content_origin", "text"],
    ["human_approved", "checkbox"],
    ["publication_authorized_by", "text"],
    ["publication_authorized_at", "date"],
    ["published_at", "date"],
  ]) {
    if (translationFields.get(name)?.type !== type) throw new Error(`Payload listing translations require ${name}:${type}`);
  }
  return { collections: config.collections.length };
}

export function writePayloadCollections(config, outPath = DEFAULT_PAYLOAD_COLLECTIONS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertPayloadCollections(config);
  fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
  return { outPath, summary };
}

export function loadPayloadCollections(filePath = DEFAULT_PAYLOAD_COLLECTIONS_OUTPUT) {
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertPayloadCollections(config);
  return config;
}
