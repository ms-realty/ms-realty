import { createHash } from "node:crypto";
import { assertViewingLedger } from "./viewing-ledger.mjs";

const COLLECTION = "viewings";
const CALENDAR_STATUSES = new Set(["pending", "not_configured", "not_connected", "synced", "failed"]);
const denyAccess = () => false;

export const VIEWING_COLLECTION = {
  slug: COLLECTION,
  access: {
    create: denyAccess,
    read: denyAccess,
    update: denyAccess,
    delete: denyAccess,
  },
  admin: { hidden: true, useAsTitle: "viewing_id" },
  fields: [
    { name: "viewing_id", type: "text", required: true, unique: true, index: true, maxLength: 160 },
    { name: "semantic_hash", type: "text", required: true, unique: true, index: true, maxLength: 64 },
    { name: "lead_id", type: "text", required: true, index: true, maxLength: 160 },
    { name: "listing_reference", type: "text", maxLength: 160 },
    { name: "original_language", type: "text", required: true, maxLength: 12 },
    { name: "admin_locale", type: "text", required: true, maxLength: 12 },
    { name: "broker", type: "text", required: true, maxLength: 160 },
    { name: "starts_at", type: "date", required: true, index: true },
    { name: "booked_at", type: "date", required: true },
    { name: "channel", type: "text", required: true, maxLength: 80 },
    { name: "status", type: "text", required: true, maxLength: 40 },
    { name: "follow_up_task_id", type: "text", required: true, maxLength: 160 },
    { name: "follow_up_owner", type: "text", required: true, maxLength: 160 },
    { name: "follow_up_status", type: "text", required: true, maxLength: 40 },
    { name: "follow_up_due_at", type: "date", required: true },
    { name: "feedback_request_id", type: "text", required: true, maxLength: 160 },
    { name: "feedback_owner", type: "text", required: true, maxLength: 160 },
    { name: "feedback_status", type: "text", required: true, maxLength: 40 },
    { name: "feedback_due_at", type: "date", required: true },
    { name: "feedback_channel", type: "text", required: true, maxLength: 80 },
    { name: "calendar_status", type: "text", required: true, defaultValue: "pending", index: true, maxLength: 32 },
    { name: "calendar_event_id", type: "text", index: true, maxLength: 320 },
    { name: "calendar_synced_at", type: "date" },
  ],
};

export class ViewingStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "ViewingStoreUnavailableError";
    this.code = "viewing_store_unavailable";
    if (cause) this.cause = cause;
  }
}

export class ViewingConflictError extends Error {
  constructor(message = "Viewing id already belongs to another booking") {
    super(message);
    this.name = "ViewingConflictError";
    this.code = "viewing_conflict";
    this.status = 409;
  }
}

export function viewingDurableStoreConfigFromEnv(env = process.env) {
  return {
    viewingDurableStoreEnabled: String(env.MS_REALTY_VIEWING_DURABLE_STORE_ENABLED || "").trim() === "true",
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    contactSecret: String(env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY || ""),
    workspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
  };
}

export function isViewingDurableStoreEnabled(config = viewingDurableStoreConfigFromEnv()) {
  return Boolean(config.viewingDurableStoreEnabled && config.payloadSecret && config.databaseUrl);
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function") {
    throw new Error("Payload runtime cannot read and write viewings");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new ViewingStoreUnavailableError("Durable viewing runtime is unavailable", error);
  }
}

function requiredText(value, name) {
  const text = String(value ?? "");
  if (!text.trim()) throw new Error(`${name} is required`);
  return text;
}

function isoDate(value, name) {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${name} must be an ISO date`);
  return new Date(value).toISOString();
}

function semanticHash(viewing) {
  return createHash("sha256")
    .update(JSON.stringify([viewing.lead_id, viewing.broker, viewing.starts_at, viewing.listing_reference || null]))
    .digest("hex");
}

export function viewingSemanticHash(viewing) {
  assertViewingLedger([viewing]);
  return semanticHash({ ...viewing, starts_at: isoDate(viewing.starts_at, "starts_at") });
}

function dataFromViewing(viewing) {
  assertViewingLedger([viewing]);
  const data = {
    viewing_id: requiredText(viewing.id, "viewing id"),
    lead_id: requiredText(viewing.lead_id, "lead_id"),
    listing_reference: viewing.listing_reference || null,
    original_language: requiredText(viewing.original_language, "original_language"),
    admin_locale: requiredText(viewing.admin_locale, "admin_locale"),
    broker: requiredText(viewing.broker, "broker"),
    starts_at: isoDate(viewing.starts_at, "starts_at"),
    booked_at: isoDate(viewing.booked_at, "booked_at"),
    channel: requiredText(viewing.channel, "channel"),
    status: requiredText(viewing.status, "status"),
    follow_up_task_id: requiredText(viewing.follow_up_task?.id, "follow_up_task.id"),
    follow_up_owner: requiredText(viewing.follow_up_task?.owner, "follow_up_task.owner"),
    follow_up_status: requiredText(viewing.follow_up_task?.status, "follow_up_task.status"),
    follow_up_due_at: isoDate(viewing.follow_up_task?.due_at, "follow_up_task.due_at"),
    feedback_request_id: requiredText(viewing.feedback_request?.id, "feedback_request.id"),
    feedback_owner: requiredText(viewing.feedback_request?.owner, "feedback_request.owner"),
    feedback_status: requiredText(viewing.feedback_request?.status, "feedback_request.status"),
    feedback_due_at: isoDate(viewing.feedback_request?.due_at, "feedback_request.due_at"),
    feedback_channel: requiredText(viewing.feedback_request?.channel, "feedback_request.channel"),
    calendar_status: viewing.calendar_sync?.status || "pending",
    calendar_event_id: viewing.calendar_sync?.calendar_event_id || null,
    calendar_synced_at: viewing.calendar_sync?.recorded_at || null,
  };
  if (!CALENDAR_STATUSES.has(data.calendar_status)) throw new Error("calendar_sync.status is invalid");
  return { ...data, semantic_hash: semanticHash(data) };
}

function viewingFromDocument(document) {
  const viewing = {
    id: requiredText(document?.viewing_id, "viewing id"),
    lead_id: requiredText(document?.lead_id, "lead_id"),
    listing_reference: document?.listing_reference || null,
    original_language: requiredText(document?.original_language, "original_language"),
    admin_locale: requiredText(document?.admin_locale, "admin_locale"),
    broker: requiredText(document?.broker, "broker"),
    starts_at: isoDate(document?.starts_at, "starts_at"),
    booked_at: isoDate(document?.booked_at, "booked_at"),
    channel: requiredText(document?.channel, "channel"),
    status: requiredText(document?.status, "status"),
    follow_up_task: {
      id: requiredText(document?.follow_up_task_id, "follow_up_task.id"),
      owner: requiredText(document?.follow_up_owner, "follow_up_task.owner"),
      status: requiredText(document?.follow_up_status, "follow_up_task.status"),
      due_at: isoDate(document?.follow_up_due_at, "follow_up_task.due_at"),
    },
    feedback_request: {
      id: requiredText(document?.feedback_request_id, "feedback_request.id"),
      owner: requiredText(document?.feedback_owner, "feedback_request.owner"),
      status: requiredText(document?.feedback_status, "feedback_request.status"),
      due_at: isoDate(document?.feedback_due_at, "feedback_request.due_at"),
      channel: requiredText(document?.feedback_channel, "feedback_request.channel"),
    },
  };
  if (document.calendar_status && document.calendar_status !== "pending") {
    viewing.calendar_sync = {
      status: String(document.calendar_status),
      provider: "google",
      calendar_event_id: document.calendar_event_id ? String(document.calendar_event_id) : null,
      recorded_at: document.calendar_synced_at ? isoDate(document.calendar_synced_at, "calendar_synced_at") : null,
    };
  }
  assertViewingLedger([viewing]);
  if (document.semantic_hash !== semanticHash(viewing)) throw new Error("Payload viewing semantic hash is invalid");
  return viewing;
}

async function findOne(payload, field, value) {
  const result = await payload.find({
    collection: COLLECTION,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { [field]: { equals: value } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload viewings query did not return documents");
  return result.docs[0] || null;
}

async function replayOrConflict(payload, data) {
  const bySemanticHash = await findOne(payload, "semantic_hash", data.semantic_hash);
  if (bySemanticHash) return { ...viewingFromDocument(bySemanticHash), idempotent: true, durable: true };
  const byViewingId = await findOne(payload, "viewing_id", data.viewing_id);
  if (!byViewingId) return null;
  if (byViewingId.semantic_hash === data.semantic_hash) {
    return { ...viewingFromDocument(byViewingId), idempotent: true, durable: true };
  }
  throw new ViewingConflictError();
}

export async function persistViewingDurably(viewing, { payload = null } = {}) {
  const data = dataFromViewing(viewing);
  try {
    const runtime = await runtimePayload(payload);
    const existing = await replayOrConflict(runtime, data);
    if (existing) return existing;
    try {
      const created = await runtime.create({ collection: COLLECTION, data, depth: 0, overrideAccess: true });
      return { ...viewingFromDocument(created), idempotent: false, durable: true };
    } catch (error) {
      const raced = await replayOrConflict(runtime, data);
      if (raced) return raced;
      throw error;
    }
  } catch (error) {
    if (error instanceof ViewingStoreUnavailableError || error instanceof ViewingConflictError) throw error;
    throw new ViewingStoreUnavailableError("Durable viewing store rejected the booking", error);
  }
}

export async function readViewingsDurably({ payload = null } = {}) {
  try {
    const runtime = await runtimePayload(payload);
    const result = await runtime.find({
      collection: COLLECTION,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: "booked_at",
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload viewings query did not return documents");
    return result.docs.map(viewingFromDocument);
  } catch (error) {
    if (error instanceof ViewingStoreUnavailableError) throw error;
    throw new ViewingStoreUnavailableError("Durable viewing read failed", error);
  }
}

export async function recordViewingCalendarSync(
  viewingId,
  result,
  { payload = null, recordedAt = new Date().toISOString() } = {},
) {
  const status = String(result?.status || "").trim();
  if (!CALENDAR_STATUSES.has(status) || status === "pending") throw new Error("calendar sync result is invalid");
  const eventId = result?.calendar_event_id ? String(result.calendar_event_id) : null;
  if (status === "synced" && !eventId) throw new Error("synced calendar result requires an event id");
  const syncedAt = isoDate(recordedAt, "calendar sync recorded_at");
  try {
    const runtime = await runtimePayload(payload);
    if (typeof runtime.update !== "function") throw new Error("Payload runtime cannot update viewing receipts");
    const document = await findOne(runtime, "viewing_id", requiredText(viewingId, "viewing id"));
    if (!document) throw new Error("Durable viewing was not found for calendar receipt");
    await runtime.update({
      collection: COLLECTION,
      id: document.id,
      depth: 0,
      overrideAccess: true,
      data: { calendar_status: status, calendar_event_id: eventId, calendar_synced_at: syncedAt },
    });
    return { status, provider: "google", calendar_event_id: eventId, recorded_at: syncedAt };
  } catch (error) {
    if (error instanceof ViewingStoreUnavailableError) throw error;
    throw new ViewingStoreUnavailableError("Durable viewing calendar receipt was not persisted", error);
  }
}
