import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { bg } from "@payloadcms/translations/languages/bg";
import { en } from "@payloadcms/translations/languages/en";
import { ru } from "@payloadcms/translations/languages/ru";
import { buildConfig } from "payload";
import { LEAD_COLLECTIONS } from "./production/lib/lead-collections.mjs";
import { FUNNEL_EVENT_COLLECTION } from "./production/lib/event-durable-store.mjs";
import { PROVIDER_CONNECTION_COLLECTION } from "./production/lib/provider-connections.mjs";
import { PROVIDER_DELIVERY_RECEIPT_COLLECTION } from "./production/lib/provider-delivery.mjs";
import { PROVIDER_WEBHOOK_EVENT_COLLECTION } from "./production/lib/provider-webhooks.mjs";
import { VIEWING_COLLECTION } from "./production/lib/viewing-durable-store.mjs";
import { REALTY_CASE_COLLECTIONS } from "./production/lib/realty-case-collections.mjs";
import { enrichmentTaskForListing, searchOutboxEventForListing } from "./production/lib/cms-seed.mjs";
import { payloadCmsImportContextEnabled } from "./production/lib/payload-cms-import.mjs";
import {
  accessForGeneratedCollection,
  adminRoleFieldAccess,
  adminsCollectionAccess,
  caseCollectionAccess,
  caseWorkspaceBoundaryHook,
  hasRole,
  isAdmin,
  referenceCollectionAccess,
  serverOwnedCollectionAccess,
} from "./production/lib/payload-access.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const generated = JSON.parse(fs.readFileSync(path.join(root, "production/data/payload-collections.json"), "utf8"));
const production = process.env.NODE_ENV === "production";

function productionRuntimeConfig() {
  const secret = String(process.env.PAYLOAD_SECRET || "").trim();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (production && (!secret || /replace-with|change-me|example|local-payload-secret/i.test(secret) || Buffer.byteLength(secret) < 32)) {
    throw new Error("PAYLOAD_SECRET must be a non-placeholder secret of at least 32 bytes in production");
  }
  if (production && (!databaseUrl || /replace-with|change-me|example/i.test(databaseUrl))) {
    throw new Error("DATABASE_URL must be configured without placeholder values in production");
  }
  return {
    databaseUrl: databaseUrl || "postgres://payload:payload@127.0.0.1:5432/ms_realty",
    secret: secret || "ms-realty-local-payload-secret",
  };
}

function configuredPublicOrigin() {
  const value = String(process.env.MS_REALTY_PUBLIC_ORIGIN || "").trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MS_REALTY_PUBLIC_ORIGIN must be a valid URL origin");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (production && url.protocol !== "https:")) {
    throw new Error("MS_REALTY_PUBLIC_ORIGIN must be an exact HTTPS origin in production");
  }
  return url.origin;
}

const runtimeConfig = productionRuntimeConfig();
const publicOrigin = configuredPublicOrigin();

const admins = {
  slug: "admins",
  auth: {
    cookies: { sameSite: "Lax", secure: production },
    maxLoginAttempts: 5,
    tokenExpiration: 2 * 60 * 60,
    useSessions: true,
  },
  admin: { useAsTitle: "email" },
  // Only an admin manages operator accounts; everyone else is limited to their
  // own record and cannot touch the role field (no self-escalation).
  access: adminsCollectionAccess,
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: ["admin", "broker", "editor", "translator"],
      access: adminRoleFieldAccess,
    },
    {
      name: "workspace_ids",
      type: "text",
      hasMany: true,
      access: adminRoleFieldAccess,
      admin: { description: "Workspaces this operator may access. Empty = admin-wide. Only admins may edit." },
    },
  ],
};

const locales = {
  slug: "locales",
  access: referenceCollectionAccess,
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

function enrichmentTaskIdDuplicate(error) {
  const validationErrors = error?.data?.errors;
  return (
    outboxIdempotencyDuplicate(error) ||
    (error?.name === "ValidationError" &&
      error?.data?.collection === "listing_enrichment_tasks" &&
      Array.isArray(validationErrors) &&
      validationErrors.length === 1 &&
      validationErrors[0]?.path === "id" &&
      validationErrors[0]?.message === "Value must be unique")
  );
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
  if (!listingId || !req?.payload || payloadCmsImportContextEnabled(req)) return;
  try {
    await req.payload.create({
      collection: "search_outbox",
      data: outboxRecordFor({ id: listingId }, { eventType, changeToken, includeListingRelation }),
      overrideAccess: true,
      req,
    });
  } catch (error) {
    if (!outboxIdempotencyDuplicate(error)) throw error;
  }
}

export async function ensureListingEnrichmentTask({ doc, req } = {}) {
  const listingId = relationId(doc?.id);
  const propertyId = relationId(doc?.property);
  if (!listingId || !propertyId || !req?.payload || payloadCmsImportContextEnabled(req)) return;
  const data = enrichmentTaskForListing({ listingId, propertyId, source: "listing_change" });
  const existing = await req.payload.find({
    collection: "listing_enrichment_tasks",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: { id: { equals: data.id } },
  });
  if (existing.docs?.length) return;
  try {
    await req.payload.create({ collection: "listing_enrichment_tasks", data, overrideAccess: true, req });
  } catch (error) {
    if (!enrichmentTaskIdDuplicate(error) || req.transactionID) throw error;
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
  const withVisibility = applyPropertyFactVisibility(input);
  // Generated content collections shipped with Payload's permissive default
  // (any authenticated user writes). Gate them by role; translations also
  // admit translators. An explicit per-collection access wins if one exists.
  const collection = {
    ...withVisibility,
    access: withVisibility.access || accessForGeneratedCollection(withVisibility.slug),
  };
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

// Realty-case collections are workspace-scoped for brokers and full-access for
// admins. Several are append-only (update/delete already forced false); we add
// role-gated create and workspace-scoped read while preserving those guards.
const caseCollectionsWithAccess = REALTY_CASE_COLLECTIONS.map((collection) => ({
  ...collection,
  access: {
    create: caseCollectionAccess.create,
    read: caseCollectionAccess.read,
    update: collection.access?.update ?? caseCollectionAccess.update,
    delete: collection.access?.delete ?? caseCollectionAccess.delete,
    ...(collection.access?.admin ? { admin: collection.access.admin } : {}),
  },
  hooks: {
    ...collection.hooks,
    beforeValidate: [...(collection.hooks?.beforeValidate || []), caseWorkspaceBoundaryHook(collection)],
  },
}));

// Lead intake is append-only server-owned state written through overrideAccess.
// Brokers may read the privacy-safe ledger; contact envelopes stay admin-only.
const leadCollectionsWithAccess = LEAD_COLLECTIONS.map((collection) => ({
  ...collection,
  access: {
    ...serverOwnedCollectionAccess,
    read: collection.slug === "lead_contacts" ? isAdmin : hasRole("admin", "broker"),
  },
}));

const funnelEventCollectionWithAccess = {
  ...FUNNEL_EVENT_COLLECTION,
  access: serverOwnedCollectionAccess,
};

const providerConnectionCollectionWithAccess = {
  ...PROVIDER_CONNECTION_COLLECTION,
  access: { ...serverOwnedCollectionAccess, read: () => false },
};

const providerWebhookEventCollectionWithAccess = {
  ...PROVIDER_WEBHOOK_EVENT_COLLECTION,
  access: { ...serverOwnedCollectionAccess, read: () => false },
};

const providerDeliveryReceiptCollectionWithAccess = {
  ...PROVIDER_DELIVERY_RECEIPT_COLLECTION,
  access: { ...serverOwnedCollectionAccess, read: () => false },
};

export default buildConfig({
  admin: { user: "admins" },
  graphQL: { disable: true, disablePlaygroundInProduction: true },
  routes: { admin: "/payload-admin" },
  // Payload adds serverURL to its CSRF allowlist, yielding one exact origin.
  ...(publicOrigin ? { serverURL: publicOrigin } : {}),
  // ponytail: explicit local fallbacks keep development importable; production fails closed above.
  secret: runtimeConfig.secret,
  i18n: {
    fallbackLanguage: "en",
    supportedLanguages: { bg, ru, en },
  },
  db: postgresAdapter({
    pool: {
      connectionString: runtimeConfig.databaseUrl,
    },
  }),
  collections: [
    admins,
    locales,
    ...collections,
    ...caseCollectionsWithAccess,
    ...leadCollectionsWithAccess,
    funnelEventCollectionWithAccess,
    providerConnectionCollectionWithAccess,
    providerWebhookEventCollectionWithAccess,
    providerDeliveryReceiptCollectionWithAccess,
    VIEWING_COLLECTION,
  ],
});
