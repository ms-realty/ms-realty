import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH = fromRoot("production", "data", "viewing-follow-ups.jsonl");

const ACTIONS = new Set(["complete", "reschedule", "no_show", "note"]);
const TASKS = new Set(["follow_up", "feedback"]);

export function resetViewingFollowUpLedger(filePath = DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readViewingFollowUps(filePath = DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function optionalNote(value) {
  const note = String(value || "").trim();
  if (note.length > 2000) throw new Error("Viewing follow-up note must be 2000 characters or fewer");
  return note || null;
}

function taskKey(value) {
  const task = String(value || "follow_up").trim();
  if (!TASKS.has(task)) throw new Error("Viewing follow-up task must be follow_up or feedback");
  return task;
}

function taskProperty(task) {
  return task === "follow_up" ? "follow_up_task" : "feedback_request";
}

function cloneTask(task, fallback = {}) {
  return { ...fallback, ...(task || {}) };
}

function initialViewingState(viewing) {
  return {
    id: viewing.id,
    lead_id: viewing.lead_id,
    listing_reference: viewing.listing_reference || null,
    original_language: viewing.original_language || null,
    admin_locale: viewing.admin_locale || null,
    broker: viewing.broker,
    starts_at: viewing.starts_at,
    booked_at: viewing.booked_at,
    channel: viewing.channel || "property_viewing",
    status: viewing.status || "booked",
    follow_up_task: cloneTask(viewing.follow_up_task, { id: `task-${viewing.lead_id}`, owner: viewing.broker, status: "open", due_at: viewing.starts_at }),
    feedback_request: cloneTask(viewing.feedback_request, { id: `feedback-${viewing.lead_id}`, owner: viewing.broker, status: "open" }),
    note_count: 0,
    last_action: null,
    last_recorded_at: null,
  };
}

function applyFollowUp(state, row) {
  const task = row.task ? taskKey(row.task) : "follow_up";
  const taskField = taskProperty(task);
  state.last_action = row.action;
  state.last_recorded_at = row.recorded_at;

  if (row.action === "complete") {
    state[taskField] = { ...state[taskField], status: "completed", completed_at: row.recorded_at };
    if (task === "follow_up" && state.status !== "no_show") state.status = "completed";
    return;
  }

  if (row.action === "reschedule") {
    state.status = "rescheduled";
    state.starts_at = row.starts_at;
    state.follow_up_task = { ...state.follow_up_task, status: "open", due_at: row.starts_at, completed_at: null };
    state.feedback_request = { ...state.feedback_request, status: "open", due_at: row.feedback_due_at, completed_at: null, resolved_at: null };
    return;
  }

  if (row.action === "no_show") {
    state.status = "no_show";
    state.follow_up_task = { ...state.follow_up_task, status: "open", due_at: row.due_at, completed_at: null };
    state.feedback_request = { ...state.feedback_request, status: "not_required", resolved_at: row.recorded_at };
    return;
  }

  if (row.action === "note") state.note_count += 1;
}

export function deriveViewingFollowUpStates(viewings, followUps) {
  const states = new Map((viewings || []).map((viewing) => [viewing.id, initialViewingState(viewing)]));
  for (const row of followUps || []) {
    const state = states.get(row.viewing_id);
    if (state) applyFollowUp(state, row);
  }
  return [...states.values()];
}

function queueRow(state, task, now) {
  const taskRow = state[taskProperty(task)];
  const dueAt = taskRow?.due_at || null;
  const dueTime = dueAt ? Date.parse(dueAt) : Number.NaN;
  return {
    id: taskRow?.id || `${task}-${state.id}`,
    viewing_id: state.id,
    lead_id: state.lead_id,
    listing_reference: state.listing_reference,
    original_language: state.original_language,
    admin_locale: state.admin_locale,
    broker: state.broker,
    starts_at: state.starts_at,
    viewing_status: state.status,
    task,
    task_status: taskRow?.status || "open",
    due_at: dueAt,
    channel: taskRow?.channel || state.channel,
    note_count: state.note_count,
    last_action: state.last_action,
    overdue: Number.isFinite(dueTime) && dueTime < now,
  };
}

export function buildViewingFollowUpQueue(viewings, followUps, { now = new Date().toISOString() } = {}) {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) throw new Error("now must be an ISO timestamp");
  const states = deriveViewingFollowUpStates(viewings, followUps);
  const rows = states
    .flatMap((state) => [queueRow(state, "follow_up", nowTime), queueRow(state, "feedback", nowTime)])
    .filter((row) => row.task_status === "open")
    .sort((left, right) => Date.parse(left.due_at || "9999-12-31") - Date.parse(right.due_at || "9999-12-31"));

  return {
    rows,
    summary: {
      total_viewings: states.length,
      open: rows.length,
      overdue: rows.filter((row) => row.overdue).length,
      booked: states.filter((state) => state.status === "booked").length,
      completed: states.filter((state) => state.status === "completed").length,
      rescheduled: states.filter((state) => state.status === "rescheduled").length,
      no_show: states.filter((state) => state.status === "no_show").length,
    },
  };
}

function sameFollowUpAction(row, input) {
  if (
    row.viewing_id !== input.viewing_id ||
    row.actor !== input.actor ||
    row.task !== input.task ||
    row.action !== input.action ||
    row.note !== input.note
  ) {
    return false;
  }
  if (input.action === "reschedule") {
    return row.starts_at === input.starts_at && row.feedback_due_at === input.feedback_due_at;
  }
  if (input.action === "no_show") return row.due_at === input.due_at;
  return true;
}

function existingIdempotentFollowUp(rows, input, state) {
  if (input.id) {
    const matchingId = rows.find((row) => row.id === input.id);
    if (matchingId) {
      if (!sameFollowUpAction(matchingId, input)) {
        throw new Error("Viewing follow-up id already belongs to a different action");
      }
      return matchingId;
    }
  }

  const matchingAction = [...rows]
    .reverse()
    .find((row) => sameFollowUpAction(row, input));
  if (!matchingAction) return null;
  if (input.action === "complete" && state[taskProperty(input.task)]?.status === "completed") return matchingAction;
  if (input.action === "reschedule" && state.status === "rescheduled" && state.starts_at === input.starts_at) return matchingAction;
  if (input.action === "no_show" && state.status === "no_show") return matchingAction;
  if (input.action === "note" && matchingAction.actor === input.actor && matchingAction.note === input.note) return matchingAction;
  return null;
}

function nextFollowUpId(rows, viewingId) {
  let ordinal = rows.filter((row) => row.viewing_id === viewingId).length + 1;
  let id = `viewing-follow-up-${viewingId}-${ordinal}`;
  const knownIds = new Set(rows.map((row) => row.id));
  while (knownIds.has(id)) {
    ordinal += 1;
    id = `viewing-follow-up-${viewingId}-${ordinal}`;
  }
  return id;
}

function normalizedFollowUpInput(viewing, input, recordedAt) {
  const action = String(input.action || "").trim();
  if (!ACTIONS.has(action)) throw new Error("Viewing follow-up action must be complete, reschedule, no_show, or note");
  const actor = String(input.actor || input.broker || "").trim();
  if (!actor) throw new Error("Viewing follow-up actor is required");
  const task = taskKey(input.task);
  const row = {
    id: input.id ? String(input.id).trim() : null,
    viewing_id: String(input.viewingId || input.viewing_id || "").trim(),
    lead_id: viewing.lead_id,
    actor,
    task,
    action,
    note: optionalNote(input.note),
    recorded_at: isoTimestamp(recordedAt, "recordedAt"),
  };

  if (action === "reschedule") {
    if (task !== "follow_up") throw new Error("Only the viewing follow-up task can reschedule a viewing");
    row.starts_at = isoTimestamp(input.startsAt || input.starts_at, "startsAt");
    row.feedback_due_at = input.feedbackDueAt || input.feedback_due_at
      ? isoTimestamp(input.feedbackDueAt || input.feedback_due_at, "feedbackDueAt")
      : new Date(Date.parse(row.starts_at) + 2 * 60 * 60 * 1000).toISOString();
  }
  if (action === "no_show") {
    if (task !== "follow_up") throw new Error("Only the viewing follow-up task can mark a viewing as no-show");
    row.due_at = isoTimestamp(input.dueAt || input.due_at, "dueAt");
  }
  return row;
}

function assertFollowUpTiming(state, followUp) {
  const recordedAt = Date.parse(followUp.recorded_at);
  const viewingStartsAt = Date.parse(state.starts_at);
  const lastRecordedAt = state.last_recorded_at ? Date.parse(state.last_recorded_at) : Number.NaN;
  if (Number.isFinite(lastRecordedAt) && recordedAt < lastRecordedAt) {
    throw new Error("Viewing follow-up recordedAt cannot precede the last recorded action");
  }
  if (followUp.action === "reschedule") {
    if (Date.parse(followUp.starts_at) <= recordedAt) throw new Error("Rescheduled viewing must start after the recorded action");
    if (Date.parse(followUp.feedback_due_at) < Date.parse(followUp.starts_at)) {
      throw new Error("Rescheduled feedback due date cannot precede the new viewing");
    }
  }
  if ((followUp.action === "complete" || followUp.action === "no_show") && Number.isFinite(viewingStartsAt) && recordedAt < viewingStartsAt) {
    throw new Error("Viewing outcome cannot be recorded before the viewing starts");
  }
  if (followUp.action === "no_show" && Date.parse(followUp.due_at) < recordedAt) {
    throw new Error("No-show follow-up due date cannot precede the recorded action");
  }
}

export function appendViewingFollowUp(
  viewings,
  input,
  { filePath = DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const viewingId = String(input.viewingId || input.viewing_id || "").trim();
  const viewing = (viewings || []).find((row) => row.id === viewingId);
  if (!viewing) throw new Error("Viewing follow-up requires a known viewingId");
  const rows = readViewingFollowUps(filePath);
  const state = deriveViewingFollowUpStates(viewings, rows).find((row) => row.id === viewingId);
  const followUp = normalizedFollowUpInput(viewing, { ...input, viewingId }, recordedAt);
  const explicitRetry = followUp.id ? existingIdempotentFollowUp(rows, followUp, state) : null;
  if (explicitRetry) return { follow_up: explicitRetry, viewing: state, idempotent: true };
  assertFollowUpTiming(state, followUp);

  if (followUp.action === "complete" && state[taskProperty(followUp.task)]?.status !== "open") {
    const prior = existingIdempotentFollowUp(rows, followUp, state);
    if (prior) return { follow_up: prior, viewing: state, idempotent: true };
    throw new Error("Viewing follow-up task is not open");
  }
  if (followUp.action === "reschedule" && state.status === "completed") throw new Error("Completed viewings cannot be rescheduled");
  if (followUp.action === "no_show" && state.status === "completed") throw new Error("Completed viewings cannot be marked no-show");

  const prior = existingIdempotentFollowUp(rows, followUp, state);
  if (prior) return { follow_up: prior, viewing: state, idempotent: true };

  const persisted = { ...followUp, id: followUp.id || nextFollowUpId(rows, viewingId) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  const nextViewing = deriveViewingFollowUpStates(viewings, [...rows, persisted]).find((row) => row.id === viewingId);
  return { follow_up: persisted, viewing: nextViewing, idempotent: false };
}

export function assertViewingFollowUpLedger(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Viewing follow-up rows must have unique ids");
    ids.add(row.id);
    if (!row.viewing_id || !row.actor || !ACTIONS.has(row.action) || !TASKS.has(row.task) || !row.recorded_at) {
      throw new Error("Viewing follow-up row is missing audit data");
    }
    isoTimestamp(row.recorded_at, "recorded_at");
    optionalNote(row.note);
    if (row.action === "reschedule") {
      isoTimestamp(row.starts_at, "starts_at");
      isoTimestamp(row.feedback_due_at, "feedback_due_at");
      if (Date.parse(row.starts_at) <= Date.parse(row.recorded_at)) {
        throw new Error("Rescheduled viewing must start after the recorded action");
      }
      if (Date.parse(row.feedback_due_at) < Date.parse(row.starts_at)) {
        throw new Error("Rescheduled feedback due date cannot precede the new viewing");
      }
    }
    if (row.action === "no_show") {
      isoTimestamp(row.due_at, "due_at");
      if (Date.parse(row.due_at) < Date.parse(row.recorded_at)) {
        throw new Error("No-show follow-up due date cannot precede the recorded action");
      }
    }
  }
  return true;
}
