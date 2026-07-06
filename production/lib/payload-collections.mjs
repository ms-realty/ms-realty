import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PAYLOAD_COLLECTIONS_OUTPUT = fromRoot("production", "data", "payload-collections.json");

const GROUP_FIELDS = {
  facts: [
    ["title", "text"],
    ["h1", "text"],
    ["description", "textarea"],
    ["location", "text"],
    ["property_type", "text"],
    ["offer_type", "text"],
    ["bedrooms", "number"],
    ["price_eur", "number"],
    ["price_on_request", "checkbox"],
    ["image_count", "number"],
  ],
  seo: [
    ["title", "text"],
    ["description", "textarea"],
    ["canonical", "text"],
    ["schema_present", "checkbox"],
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
};

function cleanField(field) {
  const { required_when: requiredWhen, records, source, ...rest } = field;
  const payloadField = {
    ...rest,
    type: field.type === "url" ? "text" : field.type,
  };
  if (field.type === "url") {
    payloadField.admin = { ...(payloadField.admin || {}), description: "URL field from migration manifest." };
  }
  if (requiredWhen) {
    payloadField.admin = {
      ...(payloadField.admin || {}),
      description: `Required before: ${requiredWhen.join(", ")}`,
    };
  }
  if (payloadField.type === "group") {
    payloadField.fields = (GROUP_FIELDS[field.name] || (field.fields || []).map((name) => [name, "text"])).map(([name, type]) => ({
      name,
      type,
    }));
  }
  if (payloadField.type === "array") {
    payloadField.fields =
      field.name === "fallback_gallery"
        ? [
            { name: "url", type: "text" },
            { name: "alt", type: "text", localized: true },
          ]
        : [{ name: "value", type: "json" }];
  }
  return payloadField;
}

export function buildPayloadCollections(manifest) {
  return {
    artifact_id: "payload-collections-20260704",
    source_artifact: manifest.artifact_id,
    generated_from: "production/data/cms-collections.json",
    collections: manifest.collections.map((collection) => ({
      slug: collection.slug,
      admin: {
        useAsTitle: collection.slug === "listings" ? "id" : collection.fields[0]?.name || "id",
        defaultColumns: collection.fields.slice(0, 4).map((field) => field.name),
      },
      versions: { drafts: true },
      labels: {
        singular: collection.slug.replaceAll("_", " "),
        plural: collection.slug.replaceAll("_", " "),
      },
      fields: collection.fields.map(cleanField),
      custom: {
        source: collection.source,
        workflow: collection.workflow,
        publish_requires_human_review: collection.publish_requires_human_review,
      },
    })),
  };
}

export function assertPayloadCollections(config) {
  const slugs = config.collections.map((collection) => collection.slug);
  for (const slug of ["listings", "listing_translations", "media_assets", "listing_tours"]) {
    if (!slugs.includes(slug)) throw new Error(`Missing Payload collection config: ${slug}`);
  }
  for (const collection of config.collections) {
    if (!collection.admin?.useAsTitle || !collection.versions?.drafts) {
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
  return { collections: config.collections.length };
}

export function writePayloadCollections(config, outPath = DEFAULT_PAYLOAD_COLLECTIONS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertPayloadCollections(config);
  fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
  return { outPath, summary };
}
