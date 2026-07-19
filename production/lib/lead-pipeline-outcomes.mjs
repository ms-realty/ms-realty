import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "lead-pipeline-outcomes.jsonl",
);

const BUYER_TYPES = new Set(["buyer", "foreign_buyer", "investor"]);
const RENTER_TYPES = new Set(["renter"]);
const ACTIONS = new Set([
  "qualify",
  "offer_submitted",
  "due_diligence_started",
  "contract_signed",
  "application_submitted",
  "lease_signed",
  "lost",
  "reopen",
  "note",
]);

export const LEAD_PIPELINES = Object.freeze({
  buyer: ["new", "qualified", "viewing_booked", "viewed", "offer", "due_diligence", "contract", "closed"],
  renter: ["inquiry", "qualified", "viewing", "application", "lease", "closed"],
});

const NEXT_ACTIONS = Object.freeze({
  buyer: {
    new: "qualify",
    qualified: "book_viewing",
    viewing_booked: "complete_viewing",
    viewed: "record_offer",
    offer: "start_due_diligence",
    due_diligence: "sign_contract",
    contract: "close_deal",
  },
  renter: {
    inquiry: "qualify",
    qualified: "book_viewing",
    viewing: "record_application",
    application: "sign_lease",
    lease: "close_deal",
  },
});

function pipelineKind(lead) {
  if (BUYER_TYPES.has(lead.lead_type)) return "buyer";
  if (RENTER_TYPES.has(lead.lead_type)) return "renter";
  return null;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function optionalNote(value, { required = false } = {}) {
  const note = String(value || "").trim();
  if (note.length > 2000) throw new Error("Lead pipeline note must be 2000 characters or fewer");
  if (required && !note) throw new Error("Lead pipeline action requires a note");
  return note || null;
}

function stringList(value, label, max = 10) {
  const rows = (Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);
  const unique = [...new Set(rows)];
  if (unique.length > max) throw new Error(`${label} must contain ${max} values or fewer`);
  if (unique.some((item) => item.length > 120)) throw new Error(`${label} values must be 120 characters or fewer`);
  return unique;
}

function optionalMoney(value, label, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (required && amount === 0)) throw new Error(`${label} must be a positive amount`);
  return Math.round(amount);
}

function qualificationRequirements(input) {
  const budgetMin = optionalMoney(input.budgetMinEur ?? input.budget_min_eur, "budgetMinEur");
  const budgetMax = optionalMoney(input.budgetMaxEur ?? input.budget_max_eur, "budgetMaxEur", { required: true });
  if (budgetMin !== null && budgetMin > budgetMax) throw new Error("budgetMinEur cannot exceed budgetMaxEur");
  const locations = stringList(input.locations, "locations");
  if (!locations.length) throw new Error("Qualification requires at least one location");
  const timeline = String(input.timeline || "").trim();
  if (!timeline || timeline.length > 200) throw new Error("Qualification timeline is required and must be 200 characters or fewer");
  const bedroomsValue = input.bedroomsMin ?? input.bedrooms_min;
  const bedroomsMin = bedroomsValue === null || bedroomsValue === undefined || bedroomsValue === "" ? null : Number(bedroomsValue);
  if (bedroomsMin !== null && (!Number.isInteger(bedroomsMin) || bedroomsMin < 0 || bedroomsMin > 20)) {
    throw new Error("bedroomsMin must be an integer from 0 to 20");
  }
  const financeStatus = String(input.financeStatus || input.finance_status || "unknown").trim().toLowerCase();
  if (!["cash", "mortgage", "preapproved", "unknown", "not_applicable"].includes(financeStatus)) {
    throw new Error("financeStatus must be cash, mortgage, preapproved, unknown, or not_applicable");
  }
  return {
    budget_min_eur: budgetMin,
    budget_max_eur: budgetMax,
    locations,
    property_types: stringList(input.propertyTypes ?? input.property_types, "propertyTypes"),
    bedrooms_min: bedroomsMin,
    timeline,
    finance_status: financeStatus,
  };
}

function initialState(lead) {
  const pipeline = pipelineKind(lead);
  if (!pipeline) return null;
  const stage = LEAD_PIPELINES[pipeline][0];
  return {
    lead_id: lead.lead_id,
    lead_type: lead.lead_type,
    pipeline,
    stage,
    previous_stage: null,
    listing_reference: lead.listing_reference || null,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    assigned_broker: lead.assigned_broker,
    received_at: lead.received_at,
    requirements: null,
    offer_amount_eur: null,
    status: "open",
    next_action: NEXT_ACTIONS[pipeline][stage],
    next_follow_up_at: lead.sla_due_at || null,
    note_count: 0,
    last_action: null,
    last_actor: null,
    last_recorded_at: lead.received_at || null,
  };
}

function stageRank(pipeline, stage) {
  return LEAD_PIPELINES[pipeline].indexOf(stage);
}

function progressTo(state, stage) {
  if (state.status === "lost" || state.status === "closed") return;
  if (stageRank(state.pipeline, stage) > stageRank(state.pipeline, state.stage)) state.stage = stage;
  if (state.stage === "closed") state.status = "closed";
}

function recordSystemEvidence(state, recordedAt) {
  if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) return;
  if (!state.last_recorded_at || Date.parse(recordedAt) > Date.parse(state.last_recorded_at)) {
    state.last_recorded_at = new Date(recordedAt).toISOString();
  }
}

function applyPipelineOutcome(state, row) {
  state.last_action = row.action;
  state.last_actor = row.actor;
  state.last_recorded_at = row.recorded_at;
  if (row.action === "note") {
    state.note_count += 1;
  } else if (row.action === "lost") {
    state.previous_stage = row.from_stage;
    state.stage = "lost";
    state.status = "lost";
  } else if (row.action === "reopen") {
    state.stage = row.to_stage;
    state.previous_stage = null;
    state.status = "open";
  } else {
    state.stage = row.to_stage;
    if (row.action === "qualify") state.requirements = row.requirements;
    if (row.action === "offer_submitted") state.offer_amount_eur = row.offer_amount_eur;
  }
  if (row.next_follow_up_at) state.next_follow_up_at = row.next_follow_up_at;
}

function pipelineEvents({ outcomes, viewings, viewingFollowUps, deals }) {
  return [
    ...(outcomes || []).map((row, index) => ({ type: "outcome", at: row.recorded_at, row, index })),
    ...(viewings || []).map((row, index) => ({ type: "viewing_booked", at: row.booked_at || row.starts_at, row, index })),
    ...(viewingFollowUps || [])
      .filter((row) => row.action === "complete" && (row.task || "follow_up") === "follow_up")
      .map((row, index) => ({ type: "viewing_completed", at: row.recorded_at, row, index })),
    ...(deals || []).map((row, index) => ({ type: "deal_closed", at: row.closed_at, row, index })),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.type.localeCompare(right.type) || left.index - right.index);
}

export function deriveLeadPipelineStates({ leads = [], outcomes = [], viewings = [], viewingFollowUps = [], deals = [] } = {}) {
  const states = new Map();
  for (const lead of leads) {
    const state = initialState(lead);
    if (state) states.set(lead.lead_id, state);
  }
  for (const event of pipelineEvents({ outcomes, viewings, viewingFollowUps, deals })) {
    const state = states.get(event.row.lead_id);
    if (!state) continue;
    if (event.type === "outcome") applyPipelineOutcome(state, event.row);
    if (event.type === "viewing_booked") {
      progressTo(state, state.pipeline === "buyer" ? "viewing_booked" : "viewing");
      recordSystemEvidence(state, event.at);
    }
    if (event.type === "viewing_completed") {
      progressTo(state, state.pipeline === "buyer" ? "viewed" : "viewing");
      recordSystemEvidence(state, event.at);
    }
    if (event.type === "deal_closed") {
      state.stage = "closed";
      state.status = "closed";
      state.last_recorded_at = event.row.closed_at;
    }
  }
  for (const state of states.values()) {
    state.next_action = state.status === "open" ? NEXT_ACTIONS[state.pipeline][state.stage] || null : null;
  }
  return [...states.values()];
}

export function buildLeadPipelineQueue(input = {}, { now = new Date().toISOString() } = {}) {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) throw new Error("now must be an ISO timestamp");
  const states = deriveLeadPipelineStates(input);
  const rows = states
    .filter((state) => state.status === "open")
    .map((state) => ({
      ...state,
      overdue: Boolean(state.next_follow_up_at && Date.parse(state.next_follow_up_at) < nowTime),
    }))
    .sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
      return Date.parse(left.next_follow_up_at || "9999-12-31") - Date.parse(right.next_follow_up_at || "9999-12-31");
    });
  return {
    rows,
    states,
    summary: {
      total: states.length,
      open: rows.length,
      overdue: rows.filter((row) => row.overdue).length,
      buyers_open: rows.filter((row) => row.pipeline === "buyer").length,
      renters_open: rows.filter((row) => row.pipeline === "renter").length,
      lost: states.filter((row) => row.status === "lost").length,
      closed: states.filter((row) => row.status === "closed").length,
      qualified: states.filter((row) => row.requirements).length,
    },
  };
}

export function resetLeadPipelineOutcomes(filePath = DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readLeadPipelineOutcomes(filePath = DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function transitionFor(state, action) {
  if (action === "note") return state.stage;
  if (action === "lost") {
    if (state.status !== "open") throw new Error("Only an open lead can be marked lost");
    return "lost";
  }
  if (action === "reopen") {
    if (state.status !== "lost") throw new Error("Only a lost lead can be reopened");
    return state.previous_stage || LEAD_PIPELINES[state.pipeline][0];
  }
  const transitions =
    state.pipeline === "buyer"
      ? {
          qualify: ["new", "qualified"],
          offer_submitted: ["viewed", "offer"],
          due_diligence_started: ["offer", "due_diligence"],
          contract_signed: ["due_diligence", "contract"],
        }
      : {
          qualify: ["inquiry", "qualified"],
          application_submitted: ["viewing", "application"],
          lease_signed: ["application", "lease"],
        };
  const transition = transitions[action];
  if (!transition) throw new Error(`${action} is not valid for the ${state.pipeline} pipeline`);
  if (state.stage !== transition[0]) throw new Error(`${action} requires ${transition[0]} stage`);
  return transition[1];
}

function normalizedOutcome(state, input, recordedAt) {
  const action = String(input.action || "").trim();
  if (!ACTIONS.has(action)) throw new Error("Unknown lead pipeline action");
  const actor = String(input.actor || input.broker || "").trim();
  if (!actor) throw new Error("Lead pipeline actor is required");
  const recorded = isoTimestamp(recordedAt, "recordedAt");
  if (state.last_recorded_at && Date.parse(recorded) < Date.parse(state.last_recorded_at)) {
    throw new Error("Lead pipeline outcomes must be recorded in chronological order");
  }
  const toStage = transitionFor(state, action);
  const note = optionalNote(input.note, { required: action === "lost" || action === "note" });
  const nextFollowUpValue = input.nextFollowUpAt || input.next_follow_up_at;
  const nextFollowUpAt = nextFollowUpValue ? isoTimestamp(nextFollowUpValue, "nextFollowUpAt") : null;
  if (nextFollowUpAt && Date.parse(nextFollowUpAt) < Date.parse(recorded)) {
    throw new Error("nextFollowUpAt cannot precede recordedAt");
  }
  const row = {
    id: input.id ? String(input.id).trim() : null,
    lead_id: state.lead_id,
    pipeline: state.pipeline,
    actor,
    action,
    from_stage: state.stage,
    to_stage: toStage,
    note,
    next_follow_up_at: nextFollowUpAt,
    recorded_at: recorded,
  };
  if (action === "qualify") row.requirements = qualificationRequirements(input);
  if (action === "offer_submitted") {
    row.offer_amount_eur = optionalMoney(input.offerAmountEur ?? input.offer_amount_eur, "offerAmountEur", { required: true });
  }
  return row;
}

function outcomeMatchesInput(row, input, leadId) {
  if (row.lead_id !== leadId) return false;
  if (row.actor !== String(input.actor || input.broker || "").trim()) return false;
  if (row.action !== String(input.action || "").trim()) return false;
  if ((row.note || null) !== optionalNote(input.note, { required: row.action === "lost" || row.action === "note" })) return false;
  const nextFollowUpValue = input.nextFollowUpAt || input.next_follow_up_at;
  const nextFollowUpAt = nextFollowUpValue ? isoTimestamp(nextFollowUpValue, "nextFollowUpAt") : null;
  if ((row.next_follow_up_at || null) !== nextFollowUpAt) return false;
  if (row.action === "qualify" && JSON.stringify(row.requirements) !== JSON.stringify(qualificationRequirements(input))) return false;
  if (
    row.action === "offer_submitted" &&
    row.offer_amount_eur !== optionalMoney(input.offerAmountEur ?? input.offer_amount_eur, "offerAmountEur", { required: true })
  ) {
    return false;
  }
  return true;
}

function nextOutcomeId(rows, leadId) {
  let ordinal = rows.filter((row) => row.lead_id === leadId).length + 1;
  const ids = new Set(rows.map((row) => row.id));
  let id = `lead-pipeline-${leadId}-${ordinal}`;
  while (ids.has(id)) {
    ordinal += 1;
    id = `lead-pipeline-${leadId}-${ordinal}`;
  }
  return id;
}

export function appendLeadPipelineOutcome(
  context,
  input,
  { filePath = DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const leadId = String(input.leadId || input.lead_id || "").trim();
  const lead = (context.leads || []).find((row) => row.lead_id === leadId);
  if (!lead || !pipelineKind(lead)) throw new Error("Lead pipeline requires a known buyer or renter leadId");
  const outcomes = readLeadPipelineOutcomes(filePath);
  const state = deriveLeadPipelineStates({ ...context, outcomes }).find((row) => row.lead_id === leadId);
  const explicitExisting = input.id ? outcomes.find((row) => row.id === String(input.id).trim()) : null;
  if (explicitExisting) {
    if (!outcomeMatchesInput(explicitExisting, input, leadId)) {
      throw new Error("Lead pipeline outcome id already belongs to another action");
    }
    return { outcome: explicitExisting, lead_pipeline: state, idempotent: true };
  }
  const implicitExisting = [...outcomes].reverse().find((row) => outcomeMatchesInput(row, input, leadId));
  if (implicitExisting) return { outcome: implicitExisting, lead_pipeline: state, idempotent: true };
  const outcome = normalizedOutcome(state, input, recordedAt);
  outcome.id ||= nextOutcomeId(outcomes, leadId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(outcome)}\n`);
  const leadPipeline = deriveLeadPipelineStates({ ...context, outcomes: [...outcomes, outcome] }).find((row) => row.lead_id === leadId);
  return { outcome, lead_pipeline: leadPipeline, idempotent: false };
}

export function assertLeadPipelineOutcomes(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Lead pipeline outcome ids must be present and unique");
    ids.add(row.id);
    if (!row.lead_id || !row.actor || !ACTIONS.has(row.action) || !LEAD_PIPELINES[row.pipeline]) {
      throw new Error("Lead pipeline outcome is missing routing data");
    }
    isoTimestamp(row.recorded_at, "recorded_at");
    optionalNote(row.note, { required: row.action === "lost" || row.action === "note" });
    const allowedStages = new Set([...LEAD_PIPELINES[row.pipeline], "lost"]);
    if (!allowedStages.has(row.from_stage) || !allowedStages.has(row.to_stage)) {
      throw new Error("Lead pipeline outcome contains an invalid stage");
    }
    if (row.next_follow_up_at) isoTimestamp(row.next_follow_up_at, "next_follow_up_at");
    if (row.action === "qualify") qualificationRequirements(row.requirements || {});
    if (row.action === "offer_submitted") optionalMoney(row.offer_amount_eur, "offer_amount_eur", { required: true });
    if (row.contact || row.email || row.phone || row.message || row.reviewed_reply) {
      throw new Error("Lead pipeline outcomes must not contain customer contact or communication content");
    }
  }
  return true;
}
