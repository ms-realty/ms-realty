import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { bg } from "@payloadcms/translations/languages/bg";
import { en } from "@payloadcms/translations/languages/en";
import { ru } from "@payloadcms/translations/languages/ru";
import { buildConfig } from "payload";
import { REALTY_CASE_COLLECTIONS } from "./production/lib/realty-case-collections.mjs";
import { enrichmentTaskForListing, searchOutboxEventForListing } from "./production/lib/cms-seed.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const generated = JSON.parse(fs.readFileSync(path.join(root, "production/data/payload-collections.json"), "utf8"));

const admins = {
  slug: "admins",
  auth: true,
  admin: { useAsTitle: "email" },
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: ["admin", "broker", "editor", "translator"],
    },
  ],
};

const locales = {
  slug: "locales",
  admin: { useAsTitle: "code", defaultColumns: ["code", "native_name", "direction", "public_enabled"] },
  fields: [
    { name: "code", type: "text", required: true, unique: true },
    { name: "native_name", type: "text", required: true },
    { name: "admin_name", type: "text", required: true },
    { name: "direction", type: "select", required: true, options: ["ltr", "rtl"] },
    { name: "public_enabled", type: "checkbox", defaultValue: false },
    { name: "indexable", type: "checkbox", defaultValue: false },
    { name: "fallback_locale", type: "relationship", relationTo: "locales" },
    { name: "reviewer_owner", type: "text" },
  ],
};

function relationId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function outboxIdempotencyDuplicate(error) {
  return [error?.code, error?.cause?.code, error?.data?.code, error?.data?.cause?.code].includes("23505");
}

function outboxRecordFor(listing, { eventType = "upsert", changeToken, includeListingRelation = true } = {}) {
  const { listing: listingId, ...event } = searchOutboxEventForListing(listing, { eventType, changeToken });
  return {
    ...event,
    ...(includeListingRelation ? { listing: listingId } : {}),
    id: `search-${Buffer.from(event.idempotency_key).toString("base64url")}`,
    attempts: 0,
  };
}

export async function enqueueListingSearchOutbox({ listing, req, eventType = "upsert", changeToken, includeListingRelation = true } = {}) {
  const listingId = relationId(listing);
  if (!listingId || !req?.payload) return;
  try {
    await req.payload.create({
      collection: "search_outbox",
      data: outboxRecordFor({ id: listingId }, { eventType, changeToken, includeListingRelation }),
      req,
    });
  } catch (error) {
    if (!outboxIdempotencyDuplicate(error)) throw error;
  }
}

export async function ensureListingEnrichmentTask({ doc, req } = {}) {
  const listingId = relationId(doc?.id);
  const propertyId = relationId(doc?.property);
  if (!listingId || !propertyId || !req?.payload) return;
  try {
    await req.payload.create({
      collection: "listing_enrichment_tasks",
      data: enrichmentTaskForListing({ listingId, propertyId, source: "listing_change" }),
      req,
    });
  } catch (error) {
    if (!outboxIdempotencyDuplicate(error)) throw error;
  }
}

export async function listingSearchOutboxHook({ doc, operation, req }) {
  await ensureListingEnrichmentTask({ doc, req });
  await enqueueListingSearchOutbox({ listing: doc, req, changeToken: doc?.updatedAt, eventType: operation === "delete" ? "delete" : "upsert" });
  return doc;
}

export async function listingDeleteSearchOutboxHook({ doc, req }) {
  // After deletion the Listing relation no longer exists, but the immutable event payload retains its id.
  await enqueueListingSearchOutbox({ listing: doc, req, changeToken: doc?.updatedAt, eventType: "delete", includeListingRelation: false });
  return doc;
}

export async function listingTranslationSearchOutboxHook({ doc, req }) {
  await enqueueListingSearchOutbox({ listing: doc?.listing, req, changeToken: doc?.updatedAt });
  return doc;
}

export async function propertySearchOutboxHook({ doc, req } = {}) {
  await enqueueListingSearchOutbox({ listing: doc?.legacy_listing_id, req, changeToken: doc?.updatedAt });
  return doc;
}

export async function propertyDeleteSearchOutboxHook({ doc, req } = {}) {
  // The Listing survives a Property delete (its relationship is set NULL), so its search document must be recomputed.
  await enqueueListingSearchOutbox({ listing: doc?.legacy_listing_id, req, changeToken: doc?.updatedAt, eventType: "upsert" });
  return doc;
}

function propertyFactFieldVisibility(field) {
  const families = field.custom?.property_families;
  if (!families) return field;
  return {
    ...field,
    admin: {
      ...field.admin,
      condition: (data, siblingData) => {
        const propertyFamily = data?.property_family || siblingData?.property_family;
        return !propertyFamily || families.includes(propertyFamily);
      },
    },
  };
}

function applyPropertyFactVisibility(collection) {
  if (collection.slug !== "properties") return collection;
  return {
    ...collection,
    fields: collection.fields.map((field) =>
      field.name === "facts" ? { ...field, fields: field.fields.map(propertyFactFieldVisibility) } : field,
    ),
  };
}

const collections = generated.collections.map((input) => {
  const collection = applyPropertyFactVisibility(input);
  if (collection.slug === "listings") {
    return {
      ...collection,
      hooks: { ...collection.hooks, afterChange: [listingSearchOutboxHook], afterDelete: [listingDeleteSearchOutboxHook] },
    };
  }
  if (collection.slug === "listing_translations") {
    return {
      ...collection,
      hooks: { ...collection.hooks, afterChange: [listingTranslationSearchOutboxHook], afterDelete: [listingTranslationSearchOutboxHook] },
    };
  }
  if (collection.slug === "properties") {
    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [...(collection.hooks?.afterChange || []), propertySearchOutboxHook],
        afterDelete: [...(collection.hooks?.afterDelete || []), propertyDeleteSearchOutboxHook],
      },
    };
  }
  return collection;
});

export default buildConfig({
  admin: { user: "admins" },
  routes: { admin: "/payload-admin" },
  // ponytail: local defaults keep build/test importable; launch readiness still requires real env values.
  secret: process.env.PAYLOAD_SECRET || "ms-realty-local-payload-secret",
  i18n: {
    fallbackLanguage: "en",
    supportedLanguages: { bg, ru, en },
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "postgres://payload:payload@127.0.0.1:5432/ms_realty",
    },
  }),
  collections: [admins, locales, ...collections, ...REALTY_CASE_COLLECTIONS],
});
