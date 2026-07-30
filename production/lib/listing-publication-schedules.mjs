import fs from "node:fs";
import path from "node:path";
import { assertPublicationReady } from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";
import { appendListingEdit, applyListingEdits, createListingEdit } from "./listing-edits.mjs";
import { appendTranslationTask } from "./translation-ledger.mjs";

export const DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH = fromRoot(
  "production",
  "data",
  "listing-publication-schedules.jsonl",
);

const ACTIONS = new Set(["publish", "unpublish"]);
const PUBLISH_STATUSES = new Set(["available", "reserved"]);
const EVENT_TYPES = new Set(["scheduled", "cancelled", "executed"]);
const STABLE_ID = /^[a-z0-9][a-z0-9._:-]{2,199}$/i;
const RAW_PRIVATE_FIELDS = new Set(["contact", "email", "message", "phone", "whatsapp"]);

function isoTimestamp(value, label) {
  const timestamp = new Date(value);
  if (!value || Number.isNaN(timestamp.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return timestamp.toISOString();
}

function requiredText(value, label, max = 500) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function optionalText(value, label, max = 500) {
  const text = String(value || "").trim();
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text || null;
}

function assertNonHermesActor(actor) {
  const value = requiredText(actor, "actor", 80);
  if (/hermes/i.test(value)) throw new Error("Hermes cannot schedule or execute public listing changes");
  return value;
}

function assertNoPrivateFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (RAW_PRIVATE_FIELDS.has(key)) throw new Error("Publication schedules must not contain private contact data");
    if (nested && typeof nested === "object") assertNoPrivateFields(nested);
  }
}

function listingFor(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

function propertyForListing(seed, listing) {
  const propertyId = String(listing?.property || "").trim();
  return propertyId ? (seed.properties || []).find((property) => property.id === propertyId) || null : null;
}

function appendEvent(event, filePath) {
  const rows = readListingPublicationSchedules(filePath);
  const existing = rows.find((row) => row.event_id === event.event_id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("Publication schedule event id is already in use");
    return { ...existing, idempotent: true };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
  return { ...event, idempotent: false };
}

function sameScheduleIntent(existing, candidate) {
  return ["schedule_id", "listing_id", "action", "target_status", "scheduled_at", "actor", "note"].every(
    (field) => (existing[field] ?? null) === (candidate[field] ?? null),
  );
}

export function resetListingPublicationSchedules(filePath = DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readListingPublicationSchedules(filePath = DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function deriveListingPublicationScheduleStates(rows = []) {
  const states = new Map();
  for (const event of rows) {
    if (event.event_type === "scheduled") {
      states.set(event.schedule_id, {
        id: event.schedule_id,
        listing_id: event.listing_id,
        action: event.action,
        target_status: event.target_status,
        scheduled_at: event.scheduled_at,
        created_at: event.created_at,
        actor: event.actor,
        note: event.note || null,
        status: "scheduled",
        last_event_at: event.created_at,
      });
      continue;
    }
    const state = states.get(event.schedule_id);
    if (!state) continue;
    if (event.event_type === "cancelled") {
      state.status = "cancelled";
      state.cancelled_at = event.cancelled_at;
      state.cancelled_by = event.actor;
      state.cancellation_reason = event.reason;
      state.last_event_at = event.cancelled_at;
    }
    if (event.event_type === "executed") {
      state.status = "executed";
      state.executed_at = event.executed_at;
      state.executed_by = event.actor;
      state.previous_status = event.previous_status;
      state.resulting_status = event.resulting_status;
      state.listing_edit_id = event.listing_edit_id || null;
      state.noop = event.noop === true;
      state.last_event_at = event.executed_at;
    }
  }
  return [...states.values()].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.id.localeCompare(b.id));
}

export function buildListingPublicationScheduleQueue(rows = [], { now = new Date().toISOString() } = {}) {
  const nowIso = isoTimestamp(now, "now");
  const states = deriveListingPublicationScheduleStates(rows).map((state) => ({
    ...state,
    due: state.status === "scheduled" && state.scheduled_at <= nowIso,
  }));
  return {
    generated_at: nowIso,
    rows: states,
    open: states.filter((state) => state.status === "scheduled"),
    summary: {
      total: states.length,
      scheduled: states.filter((state) => state.status === "scheduled").length,
      due: states.filter((state) => state.due).length,
      upcoming: states.filter((state) => state.status === "scheduled" && !state.due).length,
      executed: states.filter((state) => state.status === "executed").length,
      cancelled: states.filter((state) => state.status === "cancelled").length,
    },
  };
}

export function appendListingPublicationSchedule(
  seed,
  input,
  { filePath = DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH, createdAt = new Date().toISOString() } = {},
) {
  assertNoPrivateFields(input);
  const listingId = requiredText(input.listingId || input.listing_id, "listingId", 120);
  const listing = listingFor(seed, listingId);
  if (!listing) throw new Error("Publication schedule requires a known listingId");
  const action = String(input.action || "").trim().toLowerCase();
  if (!ACTIONS.has(action)) throw new Error("Publication schedule action must be publish or unpublish");
  const createdAtIso = isoTimestamp(createdAt, "createdAt");
  const scheduledAt = isoTimestamp(input.scheduledAt || input.scheduled_at, "scheduledAt");
  const actor = assertNonHermesActor(input.actor || input.editor);
  const targetStatus =
    action === "unpublish"
      ? "archived"
      : String(input.targetStatus || input.target_status || "available").trim().toLowerCase();
  if (action === "publish" && !PUBLISH_STATUSES.has(targetStatus)) {
    throw new Error("A publish schedule targetStatus must be available or reserved");
  }
  const requestedId = String(input.id || input.requestId || "").trim();
  const generatedId = `listing-publication-${listingId}-${action}-${scheduledAt.replace(/\D/g, "")}`;
  const scheduleId = requestedId || generatedId;
  if (!STABLE_ID.test(scheduleId)) throw new Error("Publication schedule id must be a stable identifier");
  const event = {
    event_id: `${scheduleId}:scheduled`,
    event_type: "scheduled",
    schedule_id: scheduleId,
    listing_id: listingId,
    action,
    target_status: targetStatus,
    scheduled_at: scheduledAt,
    created_at: createdAtIso,
    actor,
    note: optionalText(input.note, "note"),
  };
  const rows = readListingPublicationSchedules(filePath);
  const existing = rows.find((row) => row.event_id === event.event_id);
  if (existing) {
    if (!sameScheduleIntent(existing, event)) throw new Error("Publication schedule id is already in use");
    return { ...existing, idempotent: true };
  }
  if (scheduledAt <= createdAtIso) throw new Error("scheduledAt must be after the schedule creation time");
  const openForListing = deriveListingPublicationScheduleStates(rows).find(
    (state) => state.listing_id === listingId && state.status === "scheduled",
  );
  if (openForListing) throw new Error("Cancel the existing listing publication schedule before creating another");
  if (action === "publish") {
    assertPublicationReady({ listing, property: propertyForListing(seed, listing), now: createdAtIso, requirePublishApproval: true });
  }
  return appendEvent(event, filePath);
}

export function cancelListingPublicationSchedule(
  input,
  { filePath = DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH, cancelledAt = new Date().toISOString() } = {},
) {
  assertNoPrivateFields(input);
  const scheduleId = requiredText(input.scheduleId || input.schedule_id, "scheduleId", 200);
  const state = deriveListingPublicationScheduleStates(readListingPublicationSchedules(filePath)).find((row) => row.id === scheduleId);
  if (!state) throw new Error("Cancellation requires a known publication schedule");
  if (state.status === "cancelled") {
    const row = readListingPublicationSchedules(filePath).find((event) => event.event_id === `${scheduleId}:cancelled`);
    return { ...row, idempotent: true };
  }
  if (state.status !== "scheduled") throw new Error("Only a pending publication schedule can be cancelled");
  const cancelledAtIso = isoTimestamp(cancelledAt, "cancelledAt");
  if (cancelledAtIso < state.created_at) throw new Error("cancelledAt cannot precede schedule creation");
  const event = {
    event_id: `${scheduleId}:cancelled`,
    event_type: "cancelled",
    schedule_id: scheduleId,
    cancelled_at: cancelledAtIso,
    actor: assertNonHermesActor(input.actor || input.editor),
    reason: requiredText(input.reason, "reason", 500),
  };
  return appendEvent(event, filePath);
}

export function executeDueListingPublicationSchedules({
  seed,
  schedules,
  translationTasks = [],
  executor,
  now = new Date().toISOString(),
  scheduleFilePath = DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH,
  listingEditFilePath,
  translationLedgerPath,
}) {
  const executedAt = isoTimestamp(now, "now");
  const executedBy = assertNonHermesActor(executor);
  const queue = buildListingPublicationScheduleQueue(schedules, { now: executedAt });
  let workingSeed = seed;
  const results = [];
  for (const schedule of queue.rows.filter((row) => row.due)) {
    const listing = listingFor(workingSeed, schedule.listing_id);
    if (!listing) throw new Error(`Scheduled listing no longer exists: ${schedule.listing_id}`);
    if (schedule.action === "publish") {
      assertPublicationReady({
        listing,
        property: propertyForListing(workingSeed, listing),
        now: executedAt,
        requirePublishApproval: true,
      });
    }
    const previousStatus = listing.facts?.listing_status || "available";
    let edit = null;
    let persistedStaleTranslations = [];
    if (previousStatus !== schedule.target_status) {
      const created = createListingEdit(
        workingSeed,
        {
          id: `${schedule.id}:listing-edit`,
          listingId: schedule.listing_id,
          editor: executedBy,
          patch: { listing_status: schedule.target_status },
        },
        translationTasks,
        executedAt,
      );
      edit = appendListingEdit(created.edit, { filePath: listingEditFilePath });
      persistedStaleTranslations = edit.idempotent
        ? []
        : created.staleTranslations
            .filter((translation) => translation.id)
            .map((translation) => appendTranslationTask(translation, { filePath: translationLedgerPath }));
      workingSeed = applyListingEdits(workingSeed, [edit]);
    }
    const event = appendEvent(
      {
        event_id: `${schedule.id}:executed`,
        event_type: "executed",
        schedule_id: schedule.id,
        executed_at: executedAt,
        actor: executedBy,
        approved_by: schedule.actor,
        previous_status: previousStatus,
        resulting_status: schedule.target_status,
        listing_edit_id: edit?.id || null,
        noop: !edit,
      },
      scheduleFilePath,
    );
    results.push({ schedule, event, edit, persistedStaleTranslations });
  }
  return {
    kind: "listing_publication_schedule_execution",
    executed_at: executedAt,
    executor: executedBy,
    due: queue.summary.due,
    executed: results.length,
    results,
    queue: buildListingPublicationScheduleQueue(readListingPublicationSchedules(scheduleFilePath), { now: executedAt }),
  };
}

export function listingPublicationExecutionAuditRecords(queue) {
  return (queue?.rows || [])
    .filter((schedule) => schedule.status === "executed")
    .map((schedule) => ({
      recordedAt: schedule.executed_at,
      input: {
        action: "listing_publication_executed",
        actor: schedule.executed_by,
        objectType: "listing_publication_schedule",
        objectId: schedule.id,
        metadata: {
          listing_id: schedule.listing_id,
          approved_by: schedule.actor,
          publication_action: schedule.action,
          previous_status: schedule.previous_status,
          resulting_status: schedule.resulting_status,
          listing_edit_id: schedule.listing_edit_id,
        },
      },
    }));
}

export function assertListingPublicationSchedules(rows) {
  const eventIds = new Set();
  const scheduleStates = new Map();
  for (const row of rows) {
    assertNoPrivateFields(row);
    if (!EVENT_TYPES.has(row.event_type) || !STABLE_ID.test(String(row.event_id || "")) || !STABLE_ID.test(String(row.schedule_id || ""))) {
      throw new Error("Publication schedule row is missing event routing data");
    }
    if (eventIds.has(row.event_id)) throw new Error("Publication schedule event ids must be unique");
    eventIds.add(row.event_id);
    if (row.event_type === "scheduled") {
      if (scheduleStates.has(row.schedule_id)) throw new Error("Publication schedule ids must be unique");
      if (!row.listing_id || !ACTIONS.has(row.action) || !row.target_status) throw new Error("Scheduled publication row is incomplete");
      isoTimestamp(row.scheduled_at, "scheduled_at");
      isoTimestamp(row.created_at, "created_at");
      assertNonHermesActor(row.actor);
      if (row.scheduled_at <= row.created_at) throw new Error("scheduled_at must follow created_at");
      scheduleStates.set(row.schedule_id, { status: "scheduled", created_at: row.created_at, scheduled_at: row.scheduled_at });
    } else if (!scheduleStates.has(row.schedule_id)) {
      throw new Error("Publication schedule outcome must follow its scheduled event");
    }
    if (row.event_type === "cancelled") {
      isoTimestamp(row.cancelled_at, "cancelled_at");
      assertNonHermesActor(row.actor);
      requiredText(row.reason, "reason", 500);
      const state = scheduleStates.get(row.schedule_id);
      if (state.status !== "scheduled" || row.cancelled_at < state.created_at) {
        throw new Error("Publication cancellation must follow an open schedule");
      }
      state.status = "cancelled";
    }
    if (row.event_type === "executed") {
      isoTimestamp(row.executed_at, "executed_at");
      assertNonHermesActor(row.actor);
      if (!row.previous_status || !row.resulting_status) throw new Error("Executed publication row is incomplete");
      const state = scheduleStates.get(row.schedule_id);
      if (state.status !== "scheduled" || row.executed_at < state.scheduled_at) {
        throw new Error("Publication execution must follow a due open schedule");
      }
      state.status = "executed";
    }
  }
  deriveListingPublicationScheduleStates(rows);
  return true;
}
