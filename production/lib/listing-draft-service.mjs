import {
  createBulkListingStatusEdits,
  createListingEdit,
  LISTING_EDIT_FIELDS,
  LISTING_FACT_EDIT_FIELDS,
  LISTING_SEO_EDIT_FIELDS,
  LISTING_WORKFLOW_EDIT_FIELDS,
} from "./listing-edits.mjs";
import {
  loadPayloadCmsImportRuntime,
  projectPayloadCmsSeed,
  readPayloadCmsSnapshot,
} from "./payload-cms-import.mjs";

const PROHIBITED_FIELDS = new Set(["publish_approved", "seo_review_confirmed"]);
const FACT_FIELDS = new Set(LISTING_FACT_EDIT_FIELDS);
const WORKFLOW_FIELDS = new Set(LISTING_WORKFLOW_EDIT_FIELDS);
const SEO_FIELDS = Object.freeze({
  seo_title: "title",
  seo_description: "description",
  seo_canonical: "canonical_override",
  seo_og_title: "og_title",
  seo_og_description: "og_description",
  seo_robots: "robots",
});
const VERIFICATION_OWNER_FIELDS = Object.freeze({
  availability_verified_at: "availability_verified_by",
  location_verified_at: "location_verified_by",
  price_verified_at: "price_verified_by",
  price_on_request_verified_at: "price_on_request_verified_by",
});

export const DURABLE_LISTING_EDIT_FIELDS = Object.freeze(
  LISTING_EDIT_FIELDS.filter((field) => !PROHIBITED_FIELDS.has(field)),
);

const DURABLE_FIELD_SET = new Set(DURABLE_LISTING_EDIT_FIELDS);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function listingIdFor(value) {
  return requiredText(value, "Known listingId", 80);
}

function missingPayloadRuntime(env = process.env) {
  return !String(env.PAYLOAD_SECRET || "").trim() || !String(env.DATABASE_URL || "").trim();
}

function unavailableError(message, cause = null) {
  const error = new Error(message);
  error.status = 503;
  error.code = "payload_draft_unavailable";
  if (cause) error.cause = cause;
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  error.code = "listing_draft_not_found";
  return error;
}

function payloadUser(principal) {
  const id = requiredText(principal?.id, "Authenticated operator id", 64);
  const roles = Array.isArray(principal?.roles) ? principal.roles.map((role) => String(role || "").trim()).filter(Boolean) : [];
  const role = roles.includes("admin")
    ? "admin"
    : roles.includes("editor")
      ? "editor"
      : roles.includes("translator")
        ? "translator"
        : roles.includes("broker")
          ? "broker"
          : roles[0] || "editor";
  return { id, role, roles };
}

async function withPayloadTransaction(payload, { principal, accessMode, isolationLevel }, work) {
  const transactionID = await payload.db.beginTransaction({ accessMode, isolationLevel });
  if (!transactionID) throw unavailableError("Payload draft store did not open a transaction");
  const req = { payload, transactionID, user: payloadUser(principal) };
  let committed = false;
  try {
    const result = await work(req);
    await payload.db.commitTransaction(transactionID);
    committed = true;
    return result;
  } finally {
    if (!committed) await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
  }
}

function patchSourceFromInput(input = {}) {
  if (input.patch !== undefined) {
    if (!input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) {
      throw new Error("Listing draft patch must be an object");
    }
    return { ...input.patch };
  }
  return Object.fromEntries(
    Object.entries(input).filter(([field]) => DURABLE_FIELD_SET.has(field) || PROHIBITED_FIELDS.has(field)),
  );
}

export function listingDraftPatchFromInput(input = {}) {
  const source = patchSourceFromInput(input);
  const prohibited = Object.keys(source).filter((field) => PROHIBITED_FIELDS.has(field));
  if (prohibited.length) throw new Error(`Listing draft patch cannot change: ${prohibited.join(", ")}`);
  const unsupported = Object.keys(source).filter((field) => !DURABLE_FIELD_SET.has(field));
  if (unsupported.length) throw new Error(`Listing draft patch has unsupported fields: ${unsupported.join(", ")}`);
  if (!Object.keys(source).length) throw new Error("Listing draft patch must include editable listing fields");
  return source;
}

function mutationFromEdit(current, edit, actorId, editedAt) {
  const patch = { ...(edit.patch || {}), ...(edit.listing_patch || {}) };
  const facts = { ...(current.facts || {}) };
  const seo = { ...(current.seo || {}) };
  const workflow = { ...(current.workflow || {}) };
  const changedFields = [];

  for (const [field, value] of Object.entries(patch)) {
    if (FACT_FIELDS.has(field)) {
      if (JSON.stringify(facts[field]) !== JSON.stringify(value)) {
        facts[field] = value;
        changedFields.push(field);
      }
      continue;
    }
    if (Object.hasOwn(SEO_FIELDS, field)) {
      const target = SEO_FIELDS[field];
      if (JSON.stringify(seo[target]) !== JSON.stringify(value)) {
        seo[target] = value;
        changedFields.push(field);
      }
      continue;
    }
    if (WORKFLOW_FIELDS.has(field) && JSON.stringify(workflow[field]) !== JSON.stringify(value)) {
      workflow[field] = value;
      changedFields.push(field);
    }
  }

  if (!changedFields.length) return { changedFields: Object.keys(patch), data: null, idempotent: true };

  const priceChanged = changedFields.some((field) => field === "price_eur" || field === "price_on_request");
  const locationChanged = changedFields.some((field) => field === "location" || field === "location_precision");

  workflow.last_editor = actorId;
  workflow.last_edited_at = editedAt;
  if (priceChanged && !Object.hasOwn(patch, "price_verified_at")) {
    workflow.price_verified_at = null;
    workflow.price_verified_by = null;
  }
  if (priceChanged && !Object.hasOwn(patch, "price_on_request_verified_at")) {
    workflow.price_on_request_verified_at = null;
    workflow.price_on_request_verified_by = null;
  }
  if (locationChanged && !Object.hasOwn(patch, "location_verified_at")) {
    workflow.location_verified_at = null;
    workflow.location_verified_by = null;
  }
  for (const [field, ownerField] of Object.entries(VERIFICATION_OWNER_FIELDS)) {
    if (!Object.hasOwn(patch, field)) continue;
    workflow[ownerField] = workflow[field] ? actorId : null;
  }

  return { changedFields, data: { facts, seo, workflow }, idempotent: false };
}

export async function projectListingDraftSeed(seed, { env = process.env, payload = null, req = null } = {}) {
  if (!payload && missingPayloadRuntime(env)) return seed;
  try {
    const runtime = await loadPayloadCmsImportRuntime({ env, payload });
    const snapshot = await readPayloadCmsSnapshot({ payload: runtime, req });
    return projectPayloadCmsSeed(seed, snapshot);
  } catch (error) {
    if (!payload && /Payload runtime is not configured/i.test(String(error?.message || ""))) return seed;
    throw error;
  }
}

export async function saveListingDraft(
  seed,
  { env = process.env, payload = null, principal, input, editedAt = new Date().toISOString() } = {},
) {
  const listingId = listingIdFor(input?.listingId || input?.listing_id);
  const patch = listingDraftPatchFromInput(input);
  const validated = createListingEdit(
    seed,
    {
      listingId,
      editor: requiredText(principal?.id, "Authenticated operator id", 64),
      patch,
    },
    [],
    editedAt,
  );

  let runtime;
  try {
    runtime = await loadPayloadCmsImportRuntime({ env, payload });
  } catch (error) {
    throw unavailableError("Payload draft store is not configured", error);
  }

  return withPayloadTransaction(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
    const current = await runtime.findByID({
      collection: "listings",
      id: listingId,
      depth: 0,
      draft: true,
      req,
    });
    if (!current) throw notFoundError("Known listingId is required");
    const mutation = mutationFromEdit(current, validated.edit, principal.id, editedAt);
    if (!mutation.idempotent) {
      await runtime.update({
        collection: "listings",
        id: listingId,
        depth: 0,
        draft: true,
        req,
        data: mutation.data,
        context: {
          ms_realty_operator: {
            id: principal.id,
            roles: principal.roles,
            source: principal.source || "admin",
          },
        },
      });
    }
    const projectedSeed = await projectListingDraftSeed(seed, { payload: runtime, req });
    return {
      changedFields: mutation.changedFields,
      idempotent: mutation.idempotent,
      listingId,
      patch: clone(patch),
      projectedSeed,
    };
  });
}

export async function saveBulkListingStatusDrafts(
  seed,
  { env = process.env, payload = null, principal, input, editedAt = new Date().toISOString() } = {},
) {
  const attributed = { ...(input || {}), editor: requiredText(principal?.id, "Authenticated operator id", 64) };
  const batch = createBulkListingStatusEdits(seed, attributed, [], editedAt);

  let runtime;
  try {
    runtime = await loadPayloadCmsImportRuntime({ env, payload });
  } catch (error) {
    throw unavailableError("Payload draft store is not configured", error);
  }

  return withPayloadTransaction(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
    const edits = [];
    for (const result of batch.changes) {
      const current = await runtime.findByID({
        collection: "listings",
        id: result.listingId,
        depth: 0,
        draft: true,
        req,
      });
      if (!current) throw notFoundError(`Known listingId is required: ${result.listingId}`);
      const mutation = mutationFromEdit(current, result.edit, principal.id, editedAt);
      if (!mutation.idempotent) {
        await runtime.update({
          collection: "listings",
          id: result.listingId,
          depth: 0,
          draft: true,
          req,
          data: mutation.data,
          context: {
            ms_realty_operator: {
              id: principal.id,
              roles: principal.roles,
              source: principal.source || "admin",
            },
          },
        });
      }
      edits.push({ ...result.edit, idempotent: mutation.idempotent });
    }
    const projectedSeed = await projectListingDraftSeed(seed, { payload: runtime, req });
    return { batch, edits, projectedSeed };
  });
}
