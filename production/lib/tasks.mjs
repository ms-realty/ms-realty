import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

// A task list is the easiest screen in an operations tool to get wrong, because
// the tempting version lets a broker tick anything. Most of the work this
// workspace tracks is already owned by a route that knows how to finish it: a
// lead is answered in the inbox, a viewing is closed on the viewing screen. A
// tick here would record that the work was done without doing it.
//
// So a task has an origin. A derived task is a read of a source queue and is
// completed where it is worked; the ledger refuses to write against it. An
// authored task is one a person raised here, and only that kind can be closed
// here — with the same evidence a document checklist item demands: a note or an
// internal reference, and a named human who confirmed it.

export const DEFAULT_TASK_LEDGER_PATH = fromRoot("production", "data", "task-events.jsonl");

const store = createLedgerStore({
  name: "task_events",
  columns: ["id", "task_id", "action", "owner", "actor", "recorded_at"],
  indexes: ["task_id", "action", "owner", "recorded_at"],
});

export const TASK_ACTIONS = Object.freeze([
  "task_opened",
  "task_completed",
  "task_dismissed",
  "task_snoozed",
  "task_reassigned",
  "task_reopened",
]);

// Kinds a task can carry. Everything but `authored` is derived from a queue
// that owns its own completion, and the route named here is where that happens.
export const TASK_SOURCE_ROUTES = Object.freeze({
  integrity: "/admin/reports",
  lead: "/admin/leads",
  viewing: "/admin/viewings",
  seller: "/admin/viewings",
  request: "/admin/requests",
  pipeline: "/admin/pipeline",
});

export const TASK_PRIORITIES = Object.freeze(["critical", "urgent", "normal"]);
const PRIORITY_RANK = Object.freeze({ critical: 0, urgent: 1, normal: 2 });
const TERMINAL_STATUSES = new Set(["completed", "dismissed"]);
const ACTION_SET = new Set(TASK_ACTIONS);
const PRIORITY_SET = new Set(TASK_PRIORITIES);

const OPEN_INPUT_KEYS = new Set([
  "id",
  "eventId",
  "event_id",
  "taskId",
  "task_id",
  "taskType",
  "task_type",
  "subjectRef",
  "subject_ref",
  "owner",
  "dueAt",
  "due_at",
  "priority",
  "note",
  "reference",
  "actor",
  "humanConfirmed",
  "human_confirmed",
]);
const ACTION_INPUT_KEYS = Object.freeze({
  task_completed: new Set(["id", "eventId", "event_id", "taskId", "task_id", "action", "note", "reference", "actor", "humanConfirmed", "human_confirmed"]),
  task_dismissed: new Set(["id", "eventId", "event_id", "taskId", "task_id", "action", "reasonCode", "reason_code", "note", "actor", "humanConfirmed", "human_confirmed"]),
  task_snoozed: new Set(["id", "eventId", "event_id", "taskId", "task_id", "action", "until", "reasonCode", "reason_code", "actor", "humanConfirmed", "human_confirmed"]),
  task_reassigned: new Set(["id", "eventId", "event_id", "taskId", "task_id", "action", "owner", "note", "actor", "humanConfirmed", "human_confirmed"]),
  task_reopened: new Set(["id", "eventId", "event_id", "taskId", "task_id", "action", "reasonCode", "reason_code", "note", "dueAt", "due_at", "actor", "humanConfirmed", "human_confirmed"]),
});
const STORED_COMMON_KEYS = new Set(["id", "task_id", "action", "actor", "human_confirmed", "recorded_at"]);
const STORED_ACTION_KEYS = Object.freeze({
  task_opened: ["task_type", "subject_ref", "owner", "due_at", "priority", "note", "reference"],
  task_completed: ["note", "reference"],
  task_dismissed: ["reason_code", "note"],
  task_snoozed: ["until", "reason_code"],
  task_reassigned: ["owner", "note"],
  task_reopened: ["reason_code", "note", "due_at"],
});

function assertKnownKeys(input, allowed, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${label} field is not allowed: ${key}`);
  }
}

function reference(value, label, max = 240, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/#-]*$/.test(text)) throw new Error(`${label} must be a reference token`);
  return text;
}

function code(value, label, max = 120, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (!/^[a-z][a-z0-9_:-]*$/.test(text)) throw new Error(`${label} must be a stable code`);
  return text;
}

function bounded(value, label, max, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

function person(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > 160) throw new Error(`${label} must be 160 characters or fewer`);
  return text;
}

function timestamp(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(text).toISOString();
}

function truthy(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function priorityOf(value, label, fallback = "normal") {
  const text = String(value ?? "").trim() || fallback;
  if (!PRIORITY_SET.has(text)) throw new Error(`${label} must be one of ${TASK_PRIORITIES.join(", ")}`);
  return text;
}

// A derived task id is namespaced by its kind, so a ledger write can be refused
// on the id alone without needing the source queue in hand.
export function taskOriginOf(taskId) {
  const prefix = String(taskId || "").split(":")[0];
  return Object.hasOwn(TASK_SOURCE_ROUTES, prefix) ? "derived" : "authored";
}

function assertAuthored(taskId) {
  if (taskOriginOf(taskId) !== "derived") return;
  const route = TASK_SOURCE_ROUTES[String(taskId).split(":")[0]];
  throw new Error(`This task is completed where it is worked, at ${route}`);
}

function humanConfirmation(input, label) {
  if (!truthy(input.humanConfirmed ?? input.human_confirmed)) {
    throw new Error(`${label} requires an explicit human confirmation`);
  }
  return { actor: person(input.actor, "Task actor"), human_confirmed: true };
}

function eventId(events, taskId, action) {
  const ids = new Set(events.map((event) => event.id));
  let ordinal = events.filter((event) => event.task_id === taskId).length + 1;
  let id = `task-${taskId}-${action}-${ordinal}`;
  while (ids.has(id)) {
    ordinal += 1;
    id = `task-${taskId}-${action}-${ordinal}`;
  }
  return id.replace(/[^A-Za-z0-9._:/#@-]/g, "-");
}

function assertChronology(events, taskId, recordedAt) {
  const latest = events
    .filter((event) => event.task_id === taskId)
    .reduce((newest, event) => Math.max(newest, Date.parse(event.recorded_at)), Number.NEGATIVE_INFINITY);
  if (Number.isFinite(latest) && Date.parse(recordedAt) < latest) {
    throw new Error("Task actions must be recorded in chronological order");
  }
}

function openInput(input, recordedAt) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Task must be an object");
  // Origin first. A caller naming a derived task needs to hear where the work
  // is done, not which of their fields this entity happens not to accept.
  const taskId = reference(input.taskId || input.task_id || input.id, "Task id", 160);
  assertAuthored(taskId);
  assertKnownKeys(input, OPEN_INPUT_KEYS, "Task");
  const recorded = timestamp(recordedAt, "recordedAt");
  const dueAt = input.dueAt || input.due_at ? timestamp(input.dueAt || input.due_at, "Task dueAt") : null;
  if (dueAt && Date.parse(dueAt) < Date.parse(recorded)) throw new Error("Task dueAt cannot precede recordedAt");
  return {
    requested_id: input.eventId || input.event_id ? reference(input.eventId || input.event_id, "Task event id", 600) : null,
    task_id: taskId,
    task_type: code(input.taskType || input.task_type, "Task type"),
    subject_ref: reference(input.subjectRef || input.subject_ref, "Task subject ref", 240, false),
    owner: person(input.owner, "Task owner"),
    due_at: dueAt,
    priority: priorityOf(input.priority, "Task priority"),
    note: bounded(input.note, "Task note", 1000),
    reference: reference(input.reference, "Task reference", 240, false),
    ...humanConfirmation(input, "Opening a task"),
    recorded_at: recorded,
  };
}

function actionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Task action is required");
  const action = code(input.action, "Task action", 40);
  if (!ACTION_SET.has(action) || action === "task_opened") throw new Error("Unknown task action");
  const taskId = reference(input.taskId || input.task_id, "Task id", 160);
  assertAuthored(taskId);
  assertKnownKeys(input, ACTION_INPUT_KEYS[action], "Task action");
  const normalized = {
    requested_id: input.eventId || input.event_id ? reference(input.eventId || input.event_id, "Task event id", 600) : null,
    task_id: taskId,
    action,
    ...humanConfirmation(input, "A task action"),
  };
  if (action === "task_completed") {
    normalized.note = bounded(input.note, "Task completion note", 1000);
    normalized.reference = reference(input.reference, "Task completion reference", 240, false);
    // Same evidence bar as a document checklist item: something a later reader
    // can follow back to what was actually done.
    if (!normalized.note && !normalized.reference) {
      throw new Error("Completing a task requires a note or internal reference");
    }
  }
  if (action === "task_dismissed") {
    // Dismissing is not completing, and the difference has to survive in the
    // record: a reason code says why this work stopped mattering.
    normalized.reason_code = code(input.reasonCode || input.reason_code, "Task dismissal reason code");
    normalized.note = bounded(input.note, "Task dismissal note", 1000);
  }
  if (action === "task_snoozed") {
    normalized.until = timestamp(input.until, "Task snooze until");
    normalized.reason_code = code(input.reasonCode || input.reason_code, "Task snooze reason code");
  }
  if (action === "task_reassigned") {
    normalized.owner = person(input.owner, "Task owner");
    normalized.note = bounded(input.note, "Task reassignment note", 1000);
  }
  if (action === "task_reopened") {
    normalized.reason_code = code(input.reasonCode || input.reason_code, "Task reopen reason code");
    normalized.note = bounded(input.note, "Task reopen note", 1000);
    normalized.due_at = input.dueAt || input.due_at ? timestamp(input.dueAt || input.due_at, "Task dueAt") : null;
  }
  return normalized;
}

function parseStoredEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Task ledger event is invalid");
  const action = code(raw.action, "Task action", 40);
  if (!ACTION_SET.has(action)) throw new Error("Task ledger event has an unknown action");
  assertKnownKeys(raw, new Set([...STORED_COMMON_KEYS, ...STORED_ACTION_KEYS[action]]), "Task ledger event");
  const taskId = reference(raw.task_id, "Task id", 160);
  assertAuthored(taskId);
  const event = {
    id: reference(raw.id, "Task event id", 600),
    task_id: taskId,
    action,
    actor: person(raw.actor, "Task actor"),
    human_confirmed: true,
    recorded_at: timestamp(raw.recorded_at, "Task recordedAt"),
  };
  if (raw.human_confirmed !== true) throw new Error("Task ledger events must carry a human confirmation");
  if (action === "task_opened") {
    event.task_type = code(raw.task_type, "Task type");
    event.subject_ref = reference(raw.subject_ref, "Task subject ref", 240, false);
    event.owner = person(raw.owner, "Task owner");
    event.due_at = raw.due_at ? timestamp(raw.due_at, "Task dueAt") : null;
    event.priority = priorityOf(raw.priority, "Task priority");
    event.note = bounded(raw.note, "Task note", 1000);
    event.reference = reference(raw.reference, "Task reference", 240, false);
  }
  if (action === "task_completed") {
    event.note = bounded(raw.note, "Task completion note", 1000);
    event.reference = reference(raw.reference, "Task completion reference", 240, false);
    if (!event.note && !event.reference) throw new Error("Completing a task requires a note or internal reference");
  }
  if (action === "task_dismissed") {
    event.reason_code = code(raw.reason_code, "Task dismissal reason code");
    event.note = bounded(raw.note, "Task dismissal note", 1000);
  }
  if (action === "task_snoozed") {
    event.until = timestamp(raw.until, "Task snooze until");
    event.reason_code = code(raw.reason_code, "Task snooze reason code");
  }
  if (action === "task_reassigned") {
    event.owner = person(raw.owner, "Task owner");
    event.note = bounded(raw.note, "Task reassignment note", 1000);
  }
  if (action === "task_reopened") {
    event.reason_code = code(raw.reason_code, "Task reopen reason code");
    event.note = bounded(raw.note, "Task reopen note", 1000);
    event.due_at = raw.due_at ? timestamp(raw.due_at, "Task dueAt") : null;
  }
  return event;
}

export function deriveTasks(events = []) {
  const parsed = events.map(parseStoredEvent).sort((left, right) =>
    Date.parse(left.recorded_at) - Date.parse(right.recorded_at) || left.id.localeCompare(right.id),
  );
  const tasks = new Map();
  for (const event of parsed) {
    if (event.action === "task_opened") {
      if (tasks.has(event.task_id)) throw new Error("Task id was opened twice");
      tasks.set(event.task_id, {
        task_id: event.task_id,
        origin: "authored",
        kind: event.task_type,
        subject_ref: event.subject_ref,
        owner: event.owner,
        due_at: event.due_at,
        priority: event.priority,
        note: event.note,
        reference: event.reference,
        status: "open",
        snoozed_until: null,
        opened_at: event.recorded_at,
        opened_by: event.actor,
        resolved_at: null,
        resolved_by: null,
        resolution_note: null,
        resolution_reference: null,
        reason_code: null,
        completion: { mode: "ledger" },
        history: [],
      });
      tasks.get(event.task_id).history.push(event);
      continue;
    }
    const task = tasks.get(event.task_id);
    if (!task) throw new Error("Task action references an unknown task");
    if (TERMINAL_STATUSES.has(task.status) && event.action !== "task_reopened") {
      throw new Error("A completed or dismissed task must be reopened before it changes again");
    }
    if (event.action === "task_reopened" && !TERMINAL_STATUSES.has(task.status)) {
      throw new Error("Only a completed or dismissed task can be reopened");
    }
    if (event.action === "task_reassigned" && event.owner === task.owner) {
      throw new Error("Task is already assigned to that owner");
    }
    task.history.push(event);
    if (event.action === "task_completed") {
      task.status = "completed";
      task.resolved_at = event.recorded_at;
      task.resolved_by = event.actor;
      task.resolution_note = event.note;
      task.resolution_reference = event.reference;
    }
    if (event.action === "task_dismissed") {
      task.status = "dismissed";
      task.resolved_at = event.recorded_at;
      task.resolved_by = event.actor;
      task.resolution_note = event.note;
      task.reason_code = event.reason_code;
    }
    if (event.action === "task_snoozed") {
      task.status = "snoozed";
      task.snoozed_until = event.until;
      task.reason_code = event.reason_code;
    }
    if (event.action === "task_reassigned") task.owner = event.owner;
    if (event.action === "task_reopened") {
      task.status = "open";
      task.snoozed_until = null;
      task.resolved_at = null;
      task.resolved_by = null;
      task.resolution_note = null;
      task.resolution_reference = null;
      task.reason_code = event.reason_code;
      if (event.due_at) task.due_at = event.due_at;
    }
  }
  return [...tasks.values()].sort((left, right) => left.task_id.localeCompare(right.task_id));
}

export function resetTaskLedger(filePath = DEFAULT_TASK_LEDGER_PATH) {
  store.resetLedger(filePath);
}

export function readTaskEvents(filePath = DEFAULT_TASK_LEDGER_PATH) {
  return store.readRows(filePath);
}

function sameOpen(event, normalized) {
  if (!event) return false;
  return (
    event.task_type === normalized.task_type &&
    (event.subject_ref || null) === normalized.subject_ref &&
    event.owner === normalized.owner &&
    (event.due_at || null) === normalized.due_at &&
    event.priority === normalized.priority
  );
}

export function planOpenTask(input, { events = [], recordedAt = new Date().toISOString() } = {}) {
  const normalized = openInput(input, recordedAt);
  const existing = events.find((event) => event.task_id === normalized.task_id && event.action === "task_opened");
  if (existing) {
    if (!sameOpen(existing, normalized)) throw new Error("Task id already belongs to another task");
    return { event: existing, task: deriveTasks(events).find((task) => task.task_id === normalized.task_id), idempotent: true };
  }
  if (normalized.requested_id && events.some((event) => event.id === normalized.requested_id)) {
    throw new Error("Task event id already exists");
  }
  assertChronology(events, normalized.task_id, normalized.recorded_at);
  const event = {
    id: normalized.requested_id || eventId(events, normalized.task_id, "task_opened"),
    task_id: normalized.task_id,
    action: "task_opened",
    task_type: normalized.task_type,
    subject_ref: normalized.subject_ref,
    owner: normalized.owner,
    due_at: normalized.due_at,
    priority: normalized.priority,
    note: normalized.note,
    reference: normalized.reference,
    actor: normalized.actor,
    human_confirmed: true,
    recorded_at: normalized.recorded_at,
  };
  return {
    event,
    task: deriveTasks([...events, event]).find((task) => task.task_id === normalized.task_id),
    idempotent: false,
  };
}

export function openTask(input, { filePath = DEFAULT_TASK_LEDGER_PATH, recordedAt = new Date().toISOString() } = {}) {
  openInput(input, recordedAt);
  const events = readTaskEvents(filePath);
  const planned = planOpenTask(input, { events, recordedAt });
  if (!planned.idempotent) store.appendRow(filePath, planned.event);
  return planned;
}

export function planTaskAction(input, { events = [], recordedAt = new Date().toISOString() } = {}) {
  const normalized = actionInput(input);
  const recorded = timestamp(recordedAt, "recordedAt");
  if (normalized.requested_id) {
    const replay = events.find((event) => event.id === normalized.requested_id);
    if (replay) {
      if (replay.task_id !== normalized.task_id || replay.action !== normalized.action) {
        throw new Error("Task event id already exists");
      }
      return { event: replay, task: deriveTasks(events).find((task) => task.task_id === normalized.task_id), idempotent: true };
    }
  }
  if (!events.some((event) => event.task_id === normalized.task_id && event.action === "task_opened")) {
    throw new Error("Task action references an unknown task");
  }
  if (normalized.action === "task_snoozed" && Date.parse(normalized.until) <= Date.parse(recorded)) {
    throw new Error("Task snooze until must be in the future");
  }
  assertChronology(events, normalized.task_id, recorded);
  const event = {
    id: normalized.requested_id || eventId(events, normalized.task_id, normalized.action),
    task_id: normalized.task_id,
    action: normalized.action,
    ...Object.fromEntries(STORED_ACTION_KEYS[normalized.action].map((key) => [key, normalized[key] ?? null])),
    actor: normalized.actor,
    human_confirmed: true,
    recorded_at: recorded,
  };
  // deriveTasks re-checks the whole history, so a refused transition (acting on
  // a terminal task, reassigning to the same owner) fails here rather than
  // reaching the ledger.
  const task = deriveTasks([...events, event]).find((row) => row.task_id === normalized.task_id);
  return { event, task, idempotent: false };
}

export function appendTaskAction(input, { filePath = DEFAULT_TASK_LEDGER_PATH, recordedAt = new Date().toISOString() } = {}) {
  actionInput(input);
  timestamp(recordedAt, "recordedAt");
  const events = readTaskEvents(filePath);
  const planned = planTaskAction(input, { events, recordedAt });
  if (!planned.idempotent) store.appendRow(filePath, planned.event);
  return planned;
}

export function assertTaskEvents(events) {
  if (!Array.isArray(events)) throw new Error("Task ledger must be an array of events");
  deriveTasks(events);
  return true;
}

// The derived half. Today already fuses these five queues into one sorted list;
// if Tasks re-implemented that selection it would drift from Today within a
// release. So the selection lives here, free of copy and hrefs, and the screens
// decorate it. `task_id` is the key Today already uses, so the two lists name
// the same work with the same identifier.
// The lead half of the queue: which enquiries are still outstanding and in what
// order. Pure, and derived from the payload alone, so the renderer and the task
// queue read one implementation.
export function deriveLeadQueueState(page = {}) {
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const deliveryByLeadId = new Map((page.replyDeliveryQueue?.states || []).map((row) => [row.lead_id, row]));
  const repliedLeadIds = new Set(
    (page.replyDeliveryQueue?.states || []).filter((row) => row.status === "sent").map((row) => row.lead_id),
  );
  const priority = (lead) => {
    const delivery = deliveryByLeadId.get(lead.lead_id);
    if (repliedLeadIds.has(lead.lead_id)) return 5;
    if (delivery?.status === "failed") return 0;
    const status = leadSlaById.get(lead.lead_id)?.status || "pending";
    if (status === "manager_escalation_required") return 1;
    if (delivery?.status === "queued") return 2;
    if (status === "reminder_required") return 3;
    return 4;
  };
  return {
    leadSlaById,
    deliveryByLeadId,
    repliedLeadIds,
    pending: [...(page.leads || [])]
      .filter((lead) => !repliedLeadIds.has(lead.lead_id))
      .sort((left, right) => priority(left) - priority(right)),
  };
}

export function deriveSourceTasks(page = {}, { leadQueue = null } = {}) {
  const queue = leadQueue || deriveLeadQueueState(page);
  const rows = [];
  const trackingStatus = page.website_funnel?.lead_tracking_status;
  if (trackingStatus === "mismatch" || trackingStatus === "unavailable") {
    rows.push({
      task_id: "integrity:website-leads",
      origin: "derived",
      kind: "integrity",
      tags: "requests",
      priority: "critical",
      due_at: null,
      overdue: true,
      subject_ref: "website-lead-tracking",
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.integrity },
      source: { tracking_status: trackingStatus, tracking_gap: Number(page.website_funnel?.lead_tracking_gap || 0) },
    });
  }
  for (const lead of queue.pending || []) {
    const sla = queue.leadSlaById?.get(lead.lead_id);
    const delivery = queue.deliveryByLeadId?.get(lead.lead_id);
    const slaStatus = sla?.status || "pending";
    let priority = "normal";
    let dueAt = sla?.sla_due_at || null;
    if (delivery?.status === "failed") priority = "critical";
    else if (slaStatus === "manager_escalation_required") {
      priority = "critical";
      dueAt = sla?.manager_escalation_due_at || dueAt;
    } else if (delivery?.status === "queued") priority = "urgent";
    else if (slaStatus === "reminder_required") priority = "urgent";
    rows.push({
      task_id: `lead:${lead.lead_id}`,
      origin: "derived",
      kind: "lead",
      tags: "enquiries",
      priority,
      due_at: dueAt,
      overdue: priority !== "normal",
      subject_ref: lead.lead_id,
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.lead },
      source: { sla_status: slaStatus, delivery_status: delivery?.status || null },
    });
  }
  for (const row of page.viewingFollowUpQueue?.rows || []) {
    if (row.task_status && row.task_status !== "open") continue;
    rows.push({
      task_id: `viewing:${row.viewing_id}:${row.task}`,
      origin: "derived",
      kind: "viewing",
      tags: "follow-ups",
      priority: row.overdue ? "urgent" : "normal",
      due_at: row.due_at || null,
      overdue: row.overdue === true,
      subject_ref: row.viewing_id,
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.viewing },
      source: { task: row.task, viewing_status: row.viewing_status || null },
    });
  }
  for (const row of page.sellerPipelineQueue?.rows || []) {
    if (row.task_status && row.task_status !== "open") continue;
    rows.push({
      task_id: `seller:${row.seller_pipeline_id}:${row.task}`,
      origin: "derived",
      kind: "seller",
      tags: "follow-ups",
      priority: row.overdue ? "urgent" : "normal",
      due_at: row.due_at || null,
      overdue: row.overdue === true,
      subject_ref: row.seller_pipeline_id,
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.seller },
      source: { task: row.task, stage: row.stage || null },
    });
  }
  for (const row of page.publicRequestQueue?.rows || []) {
    if (row.status && !["open", "contacted"].includes(row.status)) continue;
    rows.push({
      task_id: `request:${row.request_type}:${row.request_id}`,
      origin: "derived",
      kind: "request",
      tags: "requests",
      priority: row.overdue ? "urgent" : "normal",
      due_at: row.next_follow_up_at || null,
      overdue: row.overdue === true,
      subject_ref: row.request_id,
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.request },
      source: { request_type: row.request_type, request_status: row.status || null },
    });
  }
  for (const row of page.leadPipelineQueue?.rows || []) {
    if (row.status && row.status !== "open") continue;
    rows.push({
      task_id: `pipeline:${row.lead_id}`,
      origin: "derived",
      kind: "pipeline",
      tags: "opportunities",
      priority: row.overdue ? "urgent" : "normal",
      due_at: row.next_follow_up_at || null,
      overdue: row.overdue === true,
      subject_ref: row.lead_id,
      status: "open",
      completion: { mode: "delegated", route: TASK_SOURCE_ROUTES.pipeline },
      source: { stage: row.stage || null, lead_type: row.lead_type || null },
    });
  }
  return rows;
}

function sortTasks(rows) {
  return rows.sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    const rank = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (rank !== 0) return rank;
    return (
      Date.parse(left.due_at || "9999-12-31") - Date.parse(right.due_at || "9999-12-31") ||
      left.task_id.localeCompare(right.task_id)
    );
  });
}

export function buildTaskQueue({ page = {}, leadQueue = null, events = [], now = new Date().toISOString() } = {}) {
  const generatedAt = timestamp(now, "now");
  const authored = deriveTasks(events);
  const derived = deriveSourceTasks(page, { leadQueue });
  const authoredRows = authored
    .filter((task) => task.status === "open" || (task.status === "snoozed" && Date.parse(task.snoozed_until) <= Date.parse(generatedAt)))
    .map((task) => ({
      task_id: task.task_id,
      origin: "authored",
      kind: task.kind,
      tags: "authored",
      priority: task.priority,
      due_at: task.due_at,
      overdue: Boolean(task.due_at && Date.parse(task.due_at) < Date.parse(generatedAt)),
      subject_ref: task.subject_ref,
      owner: task.owner,
      note: task.note,
      reference: task.reference,
      status: task.status === "snoozed" ? "open" : task.status,
      was_snoozed: task.status === "snoozed",
      completion: { mode: "ledger" },
    }));
  const rows = sortTasks([...derived, ...authoredRows]);
  return {
    kind: "task_queue",
    generated_at: generatedAt,
    rows,
    tasks: authored,
    summary: {
      total: rows.length,
      derived: derived.length,
      authored: authoredRows.length,
      overdue: rows.filter((row) => row.overdue).length,
      critical: rows.filter((row) => row.priority === "critical").length,
      // Only these can be ticked here; the rest are links to where the work is
      // actually done. The number is worth showing, because a screen where
      // nothing is completable should say so rather than look broken.
      completable: rows.filter((row) => row.completion.mode === "ledger").length,
      snoozed: authored.filter((task) => task.status === "snoozed" && Date.parse(task.snoozed_until) > Date.parse(generatedAt)).length,
      completed: authored.filter((task) => task.status === "completed").length,
      dismissed: authored.filter((task) => task.status === "dismissed").length,
    },
  };
}
