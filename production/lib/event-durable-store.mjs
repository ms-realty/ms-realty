import { randomUUID } from "node:crypto";
import { assertEventLedger } from "./events.mjs";

const immutableField = {
  access: { update: () => false },
  admin: { readOnly: true },
};

export const FUNNEL_EVENT_COLLECTION = {
  slug: "funnel_events",
  admin: {
    useAsTitle: "event_id",
    defaultColumns: ["recorded_at", "type", "path", "locale", "action"],
  },
  fields: [
    { name: "event_id", type: "text", required: true, unique: true, index: true, maxLength: 64, ...immutableField },
    { name: "recorded_at", type: "date", required: true, index: true, ...immutableField },
    { name: "type", type: "text", required: true, index: true, maxLength: 40, ...immutableField },
    { name: "path", type: "text", required: true, maxLength: 500, ...immutableField },
    { name: "locale", type: "text", required: true, maxLength: 12, ...immutableField },
    { name: "listing_reference", type: "text", maxLength: 160, ...immutableField },
    { name: "action", type: "text", maxLength: 120, ...immutableField },
    { name: "query", type: "text", maxLength: 120, ...immutableField },
    { name: "filters", type: "json", ...immutableField },
    { name: "sort", type: "text", maxLength: 120, ...immutableField },
    { name: "page", type: "number", min: 1, ...immutableField },
  ],
};

export class EventStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "EventStoreUnavailableError";
    this.code = "event_store_unavailable";
    if (cause) this.cause = cause;
  }
}

export function eventDurableStoreConfigFromEnv(env = process.env) {
  return {
    eventDurableStoreEnabled: String(env.MS_REALTY_EVENT_DURABLE_STORE_ENABLED || "").trim() === "true",
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
  };
}

export function isEventDurableStoreEnabled(config = eventDurableStoreConfigFromEnv()) {
  return Boolean(config.eventDurableStoreEnabled && config.payloadSecret && config.databaseUrl);
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.create !== "function" || typeof payload.find !== "function") {
    throw new Error("Payload runtime cannot read and write funnel events");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new EventStoreUnavailableError("Durable funnel event runtime is unavailable", error);
  }
}

function eventData(event, eventId = randomUUID()) {
  assertEventLedger([event]);
  return {
    event_id: eventId,
    recorded_at: event.recorded_at,
    type: event.type,
    path: event.path,
    locale: event.locale,
    listing_reference: event.listing_reference || null,
    action: event.action || null,
    query: event.query || null,
    filters: event.filters || {},
    sort: event.sort || null,
    page: event.page || null,
  };
}

function eventFromDocument(document) {
  return {
    recorded_at: document.recorded_at,
    type: document.type,
    path: document.path,
    locale: document.locale,
    listing_reference: document.listing_reference || null,
    action: document.action || null,
    query: document.query || null,
    filters: document.filters || {},
    sort: document.sort || null,
    page: document.page || null,
  };
}

export async function persistEventDurably(event, { payload = null } = {}) {
  const data = eventData(event);
  try {
    const runtime = await runtimePayload(payload);
    await runtime.create({ collection: "funnel_events", data, depth: 0, overrideAccess: true });
    return { ...event, event_id: data.event_id, durable: true };
  } catch (error) {
    if (error instanceof EventStoreUnavailableError) throw error;
    throw new EventStoreUnavailableError("Durable funnel event store rejected the event", error);
  }
}

export async function readEventsDurably({ payload = null } = {}) {
  try {
    const runtime = await runtimePayload(payload);
    const result = await runtime.find({
      collection: "funnel_events",
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: "recorded_at",
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload funnel_events query did not return documents");
    const events = result.docs.map(eventFromDocument);
    if (events.length) assertEventLedger(events);
    return events;
  } catch (error) {
    if (error instanceof EventStoreUnavailableError) throw error;
    throw new EventStoreUnavailableError("Durable funnel event read failed", error);
  }
}
