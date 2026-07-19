import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH = fromRoot("production", "data", "seller-pipeline-outcomes.jsonl");

const ACTIONS = new Set([
  "callback_completed",
  "appraisal_scheduled",
  "appraisal_completed",
  "mandate_signed",
  "listing_draft_started",
  "listing_published",
  "offer_received",
  "sale_completed",
  "closed_lost",
  "note",
]);

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function optionalNote(value) {
  const note = String(value || "").trim();
  if (note.length > 2000) throw new Error("Seller pipeline note must be 2000 characters or fewer");
  return note || null;
}

function taskFor(state, kind, { dueAt = null, status = "open" } = {}) {
  return {
    id: `seller-${kind}-${state.lead_id}`,
    kind,
    owner: state.owner,
    status,
    ...(dueAt ? { due_at: dueAt } : {}),
  };
}

function initialSellerPipelineState(pipeline) {
  return {
    ...pipeline,
    checklist: {
      callback: pipeline.checklist?.callback || "open",
      appraisal: pipeline.checklist?.appraisal || "not_started",
      mandate: pipeline.checklist?.mandate || "not_started",
      draft_listing: pipeline.checklist?.draft_listing || "not_started",
      publication: pipeline.checklist?.publication || "not_started",
      offer: pipeline.checklist?.offer || "not_started",
      close: pipeline.checklist?.close || "not_started",
    },
    next_task: pipeline.next_task || taskFor(pipeline, "callback"),
    appraisal_at: null,
    listing_reference: pipeline.listing_reference || null,
    public_path: null,
    offer_amount_eur: null,
    sale_price_eur: null,
    commission_eur: null,
    last_action: null,
    last_recorded_at: null,
    note_count: 0,
  };
}

function applyOutcome(state, outcome) {
  state.last_action = outcome.action;
  state.last_recorded_at = outcome.recorded_at;

  if (outcome.action === "note") {
    state.note_count += 1;
    return;
  }

  if (outcome.action === "callback_completed") {
    state.stage = "callback_completed";
    state.checklist.callback = "completed";
    state.checklist.appraisal = "open";
    state.next_task = taskFor(state, "appraisal");
    return;
  }

  if (outcome.action === "appraisal_scheduled") {
    state.stage = "appraisal_scheduled";
    state.checklist.appraisal = "scheduled";
    state.appraisal_at = outcome.appraisal_at;
    state.next_task = taskFor(state, "appraisal", { dueAt: outcome.appraisal_at });
    return;
  }

  if (outcome.action === "appraisal_completed") {
    state.stage = "appraisal_completed";
    state.checklist.appraisal = "completed";
    state.checklist.mandate = "open";
    state.next_task = taskFor(state, "mandate");
    return;
  }

  if (outcome.action === "mandate_signed") {
    state.stage = "mandate_signed";
    state.checklist.mandate = "completed";
    state.checklist.draft_listing = "open";
    state.next_task = taskFor(state, "listing_draft");
    return;
  }

  if (outcome.action === "listing_draft_started") {
    state.stage = "listing_draft_started";
    state.checklist.draft_listing = "in_progress";
    state.checklist.publication = "open";
    state.listing_reference = outcome.listing_reference;
    state.next_task = taskFor(state, "listing_publish");
    return;
  }

  if (outcome.action === "listing_published") {
    state.stage = "published";
    state.checklist.draft_listing = "completed";
    state.checklist.publication = "completed";
    state.checklist.offer = "open";
    state.listing_reference = outcome.listing_reference;
    state.public_path = outcome.public_path;
    state.next_task = taskFor(state, "listing_offer");
    return;
  }

  if (outcome.action === "offer_received") {
    state.stage = "offer_received";
    state.checklist.offer = "completed";
    state.checklist.close = "open";
    state.offer_amount_eur = outcome.offer_amount_eur;
    state.next_task = taskFor(state, "seller_close");
    return;
  }

  if (outcome.action === "sale_completed") {
    state.stage = "closed";
    state.status = "completed";
    state.checklist.close = "completed";
    state.sale_price_eur = outcome.sale_price_eur;
    state.commission_eur = outcome.commission_eur;
    state.next_task = taskFor(state, "seller_close", { status: "completed" });
    return;
  }

  if (outcome.action === "closed_lost") {
    state.stage = "closed_lost";
    state.status = "closed_lost";
    state.next_task = { ...(state.next_task || taskFor(state, "callback")), status: "closed" };
  }
}

export function deriveSellerPipelineStates(pipelines = [], outcomes = []) {
  const states = new Map((pipelines || []).map((pipeline) => [pipeline.id, initialSellerPipelineState(pipeline)]));
  for (const outcome of outcomes || []) {
    const state = states.get(outcome.seller_pipeline_id);
    if (state) applyOutcome(state, outcome);
  }
  return [...states.values()];
}

function queueRow(state, nowTime) {
  const task = state.next_task || {};
  if (state.status !== "open" || task.status !== "open") return null;
  const dueTime = task.due_at ? Date.parse(task.due_at) : Number.NaN;
  return {
    id: task.id || `seller-${state.id}`,
    seller_pipeline_id: state.id,
    lead_id: state.lead_id,
    property: state.property || {},
    original_language: state.original_language || null,
    admin_locale: state.admin_locale || null,
    owner: task.owner || state.owner,
    stage: state.stage,
    status: state.status,
    task: task.kind || "seller_callback",
    task_status: task.status || "open",
    due_at: task.due_at || null,
    appraisal_at: state.appraisal_at || null,
    listing_reference: state.listing_reference || null,
    public_path: state.public_path || null,
    offer_amount_eur: state.offer_amount_eur,
    last_action: state.last_action,
    note_count: state.note_count,
    overdue: Number.isFinite(dueTime) && dueTime < nowTime,
  };
}

export function buildSellerPipelineQueue(pipelines = [], outcomes = [], { now = new Date().toISOString() } = {}) {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) throw new Error("now must be an ISO timestamp");
  const states = deriveSellerPipelineStates(pipelines, outcomes);
  const rows = states
    .map((state) => queueRow(state, nowTime))
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.due_at || "9999-12-31") - Date.parse(right.due_at || "9999-12-31"));

  return {
    rows,
    states,
    summary: {
      total: states.length,
      open: rows.length,
      overdue: rows.filter((row) => row.overdue).length,
      completed: states.filter((state) => state.status === "completed").length,
      closed_lost: states.filter((state) => state.status === "closed_lost").length,
    },
  };
}

export function resetSellerPipelineOutcomes(filePath = DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readSellerPipelineOutcomes(filePath = DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function requiredText(value, label, max = 500) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function money(value, label, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (required && amount === 0)) throw new Error(`${label} must be a positive amount`);
  return Math.round(amount);
}

function normalizedOutcomeInput(pipeline, state, input, recordedAt) {
  const action = String(input.action || "").trim();
  if (!ACTIONS.has(action)) throw new Error("Seller pipeline action is invalid");
  const actor = String(input.actor || input.broker || "").trim();
  if (!actor) throw new Error("Seller pipeline actor is required");
  const outcome = {
    id: input.id ? String(input.id).trim() : null,
    seller_pipeline_id: pipeline.id,
    lead_id: pipeline.lead_id,
    actor,
    action,
    note: optionalNote(input.note),
    recorded_at: isoTimestamp(recordedAt, "recordedAt"),
  };
  if (action === "appraisal_scheduled") {
    outcome.appraisal_at = isoTimestamp(input.appraisalAt || input.appraisal_at, "appraisalAt");
  }
  if (action === "listing_draft_started") {
    outcome.listing_reference = requiredText(input.listingReference || input.listing_reference, "listingReference", 120);
  }
  if (action === "listing_published") {
    outcome.listing_reference = requiredText(
      input.listingReference || input.listing_reference || state.listing_reference,
      "listingReference",
      120,
    );
    outcome.public_path = requiredText(input.publicPath || input.public_path, "publicPath", 500);
    if (!outcome.public_path.startsWith("/") || outcome.public_path.startsWith("//")) {
      throw new Error("publicPath must be a canonical path");
    }
  }
  if (action === "offer_received") {
    outcome.offer_amount_eur = money(input.offerAmountEur ?? input.offer_amount_eur, "offerAmountEur", { required: true });
  }
  if (action === "sale_completed") {
    outcome.sale_price_eur = money(input.salePriceEur ?? input.sale_price_eur, "salePriceEur", { required: true });
    outcome.commission_eur = money(input.commissionEur ?? input.commission_eur, "commissionEur");
  }
  if (action === "closed_lost" && !outcome.note) throw new Error("Closing a seller pipeline as lost requires a note");
  return outcome;
}

function sameOutcome(row, outcome) {
  return (
    row.seller_pipeline_id === outcome.seller_pipeline_id &&
    row.actor === outcome.actor &&
    row.action === outcome.action &&
    row.note === outcome.note &&
    (row.appraisal_at || null) === (outcome.appraisal_at || null) &&
    (row.listing_reference || null) === (outcome.listing_reference || null) &&
    (row.public_path || null) === (outcome.public_path || null) &&
    (row.offer_amount_eur ?? null) === (outcome.offer_amount_eur ?? null) &&
    (row.sale_price_eur ?? null) === (outcome.sale_price_eur ?? null) &&
    (row.commission_eur ?? null) === (outcome.commission_eur ?? null)
  );
}

function existingIdempotentOutcome(rows, outcome) {
  if (outcome.id) {
    const byId = rows.find((row) => row.id === outcome.id);
    if (byId) {
      if (!sameOutcome(byId, outcome)) throw new Error("Seller pipeline outcome id already belongs to a different action");
      return byId;
    }
  }

  const matching = [...rows].reverse().find((row) => sameOutcome(row, outcome));
  if (!matching) return null;
  return outcome.action === "note" ? null : matching;
}

function assertTimeline(state, outcome) {
  const recordedAt = Date.parse(outcome.recorded_at);
  const createdAt = state.created_at ? Date.parse(state.created_at) : Number.NaN;
  const lastRecordedAt = state.last_recorded_at ? Date.parse(state.last_recorded_at) : Number.NaN;
  if (Number.isFinite(createdAt) && recordedAt < createdAt) {
    throw new Error("Seller pipeline recordedAt cannot precede the valuation request");
  }
  if (Number.isFinite(lastRecordedAt) && recordedAt < lastRecordedAt) {
    throw new Error("Seller pipeline recordedAt cannot precede the last recorded action");
  }
  if (outcome.action === "appraisal_scheduled" && Date.parse(outcome.appraisal_at) <= recordedAt) {
    throw new Error("Seller appraisal must be scheduled after the recorded action");
  }
  if (outcome.action === "appraisal_completed" && state.appraisal_at && recordedAt < Date.parse(state.appraisal_at)) {
    throw new Error("Seller appraisal cannot complete before its scheduled time");
  }
}

function assertTransition(state, outcome) {
  if (outcome.action === "note") return;
  if (state.status !== "open") throw new Error("Seller pipeline is already closed");
  if (outcome.action === "callback_completed" && state.checklist.callback !== "open") {
    throw new Error("Seller callback task is not open");
  }
  if (
    outcome.action === "appraisal_scheduled" &&
    (state.checklist.callback !== "completed" || !["open", "scheduled"].includes(state.checklist.appraisal))
  ) {
    throw new Error("Seller appraisal can be scheduled only after the callback is completed");
  }
  if (outcome.action === "appraisal_completed" && state.checklist.appraisal !== "scheduled") {
    throw new Error("Seller appraisal must be scheduled before it can be completed");
  }
  if (outcome.action === "mandate_signed" && state.checklist.mandate !== "open") {
    throw new Error("Seller mandate can be signed only after the appraisal is completed");
  }
  if (outcome.action === "listing_draft_started" && state.checklist.draft_listing !== "open") {
    throw new Error("Seller listing draft can start only after the mandate is signed");
  }
  if (outcome.action === "listing_published" && state.checklist.publication !== "open") {
    throw new Error("Seller listing can publish only after its draft is started");
  }
  if (outcome.action === "listing_published" && state.listing_reference !== outcome.listing_reference) {
    throw new Error("Published listing reference must match the seller draft");
  }
  if (outcome.action === "offer_received" && state.checklist.offer !== "open") {
    throw new Error("Seller offer can be recorded only after the listing is published");
  }
  if (outcome.action === "sale_completed" && state.checklist.close !== "open") {
    throw new Error("Seller sale can close only after an offer is recorded");
  }
}

function nextOutcomeId(rows, pipelineId) {
  let ordinal = rows.filter((row) => row.seller_pipeline_id === pipelineId).length + 1;
  let id = `seller-pipeline-outcome-${pipelineId}-${ordinal}`;
  const knownIds = new Set(rows.map((row) => row.id));
  while (knownIds.has(id)) {
    ordinal += 1;
    id = `seller-pipeline-outcome-${pipelineId}-${ordinal}`;
  }
  return id;
}

export function appendSellerPipelineOutcome(
  pipelines,
  input,
  { filePath = DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const pipelineId = String(input.sellerPipelineId || input.seller_pipeline_id || input.pipelineId || "").trim();
  const pipeline = (pipelines || []).find((row) => row.id === pipelineId);
  if (!pipeline) throw new Error("Seller pipeline outcome requires a known sellerPipelineId");
  const rows = readSellerPipelineOutcomes(filePath);
  const state = deriveSellerPipelineStates(pipelines, rows).find((row) => row.id === pipelineId);
  const outcome = normalizedOutcomeInput(pipeline, state, input, recordedAt);
  const explicitRetry = existingIdempotentOutcome(rows, outcome);
  if (explicitRetry) return { outcome: explicitRetry, seller_pipeline: state, idempotent: true };

  assertTimeline(state, outcome);
  assertTransition(state, outcome);

  const persisted = { ...outcome, id: outcome.id || nextOutcomeId(rows, pipelineId) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  const sellerPipeline = deriveSellerPipelineStates(pipelines, [...rows, persisted]).find((row) => row.id === pipelineId);
  return { outcome: persisted, seller_pipeline: sellerPipeline, idempotent: false };
}

export function assertSellerPipelineOutcomes(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Seller pipeline outcome rows must have unique ids");
    ids.add(row.id);
    if (!row.seller_pipeline_id || !row.lead_id || !row.actor || !ACTIONS.has(row.action) || !row.recorded_at) {
      throw new Error("Seller pipeline outcome row is missing audit data");
    }
    isoTimestamp(row.recorded_at, "recorded_at");
    optionalNote(row.note);
    if (row.action === "appraisal_scheduled") {
      isoTimestamp(row.appraisal_at, "appraisal_at");
      if (Date.parse(row.appraisal_at) <= Date.parse(row.recorded_at)) {
        throw new Error("Seller appraisal must be scheduled after the recorded action");
      }
    }
    if (["listing_draft_started", "listing_published"].includes(row.action)) {
      requiredText(row.listing_reference, "listing_reference", 120);
    }
    if (row.action === "listing_published") {
      const publicPath = requiredText(row.public_path, "public_path", 500);
      if (!publicPath.startsWith("/") || publicPath.startsWith("//")) throw new Error("public_path must be a canonical path");
    }
    if (row.action === "offer_received") money(row.offer_amount_eur, "offer_amount_eur", { required: true });
    if (row.action === "sale_completed") {
      money(row.sale_price_eur, "sale_price_eur", { required: true });
      money(row.commission_eur, "commission_eur");
    }
    if (row.action === "closed_lost" && !optionalNote(row.note)) throw new Error("Closed-lost seller outcome requires a note");
    if (row.contact || row.email || row.phone || row.message) {
      throw new Error("Seller pipeline outcomes must not contain customer contact or message content");
    }
  }
  return true;
}

export function assertSellerCanCloseDeal(pipelines, outcomes, leadId) {
  const state = deriveSellerPipelineStates(pipelines, outcomes).find((row) => row.lead_id === leadId);
  if (!state) throw new Error("Seller deal requires a seller pipeline");
  if (state.status !== "completed" || state.stage !== "closed") {
    throw new Error("Seller sale must be completed before creating deal aftercare");
  }
  return state;
}
