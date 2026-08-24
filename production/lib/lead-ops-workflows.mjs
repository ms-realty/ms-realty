// The lead inbox verbs, once, for both runtimes.
//
// http.mjs (the standalone server) and app-admin-adapter.mjs (the Next.js
// adapter) each used to carry their own copy of snooze / unsnooze / assign /
// bulk / pipeline-outcome / seller-outcome / deal-close. The copies had already
// drifted, and adding a durable backend to each separately would have doubled
// the drift. Both now call the functions below, which differ from the originals
// only in that the ledger they read and append to is injected.
//
// A ledger is `{ read(): Promise<rows>, append(row): Promise<row> }`. The file
// implementation reads and appends JSONL exactly as before; the durable one
// reads and appends the `lead_operations` Postgres collection. The rules —
// validation, transition guards, idempotency, id minting — live in the ledger
// modules' resolve* functions and run identically over whichever rows come back.
import fs from "node:fs";
import path from "node:path";
import { bindAuthenticatedOperator } from "./admin-auth.mjs";
import { DEFAULT_DEAL_LEDGER_PATH, readDeals, resolveClosedDeal } from "./deal-ledger.mjs";
import {
  DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
  createLeadAssignment,
  readLeadAssignments,
  resolveLeadAssignmentAppend,
} from "./lead-assignments.mjs";
import {
  LEAD_OPERATIONS,
  appendLeadOperationDurably as appendLeadOperationDurablyStore,
  readLeadOperationsDurably as readLeadOperationsDurablyStore,
} from "./lead-ops-durable-store.mjs";
import {
  DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
  readLeadPipelineOutcomes,
  resolveLeadPipelineOutcome,
} from "./lead-pipeline-outcomes.mjs";
import {
  DEFAULT_LEAD_SNOOZE_LEDGER_PATH,
  createLeadSnooze,
  createLeadUnsnooze,
  readLeadSnoozes,
  resolveLeadSnoozeAppend,
} from "./lead-snoozes.mjs";
import { DEFAULT_BROKER_PROFILES } from "./leads.mjs";
import {
  DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH,
  readSellerPipelineOutcomes,
  resolveSellerPipelineOutcome,
} from "./seller-pipeline-outcomes.mjs";

const BULK_ACTIONS = new Set(["assign", "snooze", "handle"]);
const MAX_BULK_LEADS = 100;

function fileLedger(filePath, read) {
  return {
    durable: false,
    async read() {
      return read(filePath);
    },
    async append(row) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
      return row;
    },
  };
}

function durableLedger(operation, { payload, workspaceId, readOperations, appendOperations }) {
  return {
    durable: true,
    async read() {
      return readOperations({ operation, payload, workspaceId });
    },
    async append(row) {
      const stored = await appendOperations({ operation, payload, row, workspaceId });
      return stored.row;
    },
  };
}

/**
 * The five lead-operation ledgers, either file-backed or durable.
 *
 * `durable` is the caller's decision: it is true only when the operator enabled
 * the durable operations store AND its runtime is configured. Anything short of
 * that keeps the file ledgers, and the boundary keeps refusing the routes.
 */
export function leadOperationLedgers({
  durable = false,
  payload = null,
  workspaceId = "",
  paths = {},
  readOperations = readLeadOperationsDurablyStore,
  appendOperations = appendLeadOperationDurablyStore,
} = {}) {
  const durableFor = (operation) => durableLedger(operation, { payload, workspaceId, readOperations, appendOperations });
  const fileFor = (filePath, read, defaultPath) => fileLedger(filePath || defaultPath, read);
  return {
    durable,
    snoozes: durable
      ? durableFor(LEAD_OPERATIONS.snooze)
      : fileFor(paths.snooze, readLeadSnoozes, DEFAULT_LEAD_SNOOZE_LEDGER_PATH),
    assignments: durable
      ? durableFor(LEAD_OPERATIONS.assignment)
      : fileFor(paths.assignment, readLeadAssignments, DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH),
    leadPipelineOutcomes: durable
      ? durableFor(LEAD_OPERATIONS.leadPipelineOutcome)
      : fileFor(paths.leadPipelineOutcome, readLeadPipelineOutcomes, DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH),
    sellerPipelineOutcomes: durable
      ? durableFor(LEAD_OPERATIONS.sellerPipelineOutcome)
      : fileFor(paths.sellerPipelineOutcome, readSellerPipelineOutcomes, DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH),
    deals: durable ? durableFor(LEAD_OPERATIONS.deal) : fileFor(paths.deal, readDeals, DEFAULT_DEAL_LEDGER_PATH),
  };
}

/**
 * The lead journey context, with every ledger this module owns read through the
 * injected ledgers rather than off disk.
 *
 * This is what makes a durable snooze or outcome show up again after a restart:
 * the same rows the writers appended are the rows the pipeline queue, the SLA
 * clock and the inbox render from.
 */
export async function leadJourneyContextFrom({
  ledgers,
  leads = [],
  viewings = [],
  viewingFollowUps = [],
  sellerPipelines = [],
} = {}) {
  const [outcomes, deals, sellerPipelineOutcomes] = await Promise.all([
    ledgers.leadPipelineOutcomes.read(),
    ledgers.deals.read(),
    ledgers.sellerPipelineOutcomes.read(),
  ]);
  return { leads, outcomes, viewings, viewingFollowUps, deals, sellerPipelines, sellerPipelineOutcomes };
}

function auditWith(audit) {
  return (entry, recordedAt) => {
    if (typeof audit === "function") audit(entry, recordedAt);
  };
}

async function persist(ledger, resolved, key = "record") {
  const row = resolved[key];
  if (resolved.idempotent) return row;
  return ledger.append(row);
}

export async function recordLeadSnoozeOperation({ ledgers, leads, input, principal, recordedAt, audit } = {}) {
  const write = auditWith(audit);
  const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
  const rows = await ledgers.snoozes.read();
  const record = createLeadSnooze(leads, rows, bound, recordedAt);
  const resolved = resolveLeadSnoozeAppend(rows, record);
  const persisted = await persist(ledgers.snoozes, resolved);
  if (!resolved.idempotent) {
    write(
      {
        action: "lead_snoozed",
        actor: persisted.actor,
        objectType: "lead_snooze",
        objectId: persisted.id,
        metadata: { lead_id: persisted.lead_id, until: persisted.until, reason: persisted.reason },
      },
      recordedAt,
    );
  }
  return { ...persisted, idempotent: resolved.idempotent };
}

export async function recordLeadUnsnoozeOperation({ ledgers, leads, input, principal, recordedAt, audit } = {}) {
  const write = auditWith(audit);
  const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
  const rows = await ledgers.snoozes.read();
  const record = createLeadUnsnooze(leads, rows, bound, recordedAt);
  const resolved = resolveLeadSnoozeAppend(rows, record);
  const persisted = await persist(ledgers.snoozes, resolved);
  if (!resolved.idempotent) {
    write(
      {
        action: "lead_unsnoozed",
        actor: persisted.actor,
        objectType: "lead_snooze",
        objectId: persisted.id,
        metadata: { lead_id: persisted.lead_id, snooze_id: persisted.snooze_id, reason: persisted.reason },
      },
      recordedAt,
    );
  }
  return { ...persisted, idempotent: resolved.idempotent };
}

export async function recordLeadAssignmentOperation({
  ledgers,
  leads,
  input,
  principal,
  recordedAt,
  brokerProfiles = DEFAULT_BROKER_PROFILES,
  audit,
} = {}) {
  const write = auditWith(audit);
  const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
  const rows = await ledgers.assignments.read();
  const assignment = createLeadAssignment(leads, bound, recordedAt, brokerProfiles);
  const resolved = resolveLeadAssignmentAppend(rows, assignment);
  const persisted = await persist(ledgers.assignments, resolved);
  if (!resolved.idempotent) {
    write(
      {
        action: "lead_assigned",
        actor: persisted.assigned_by,
        objectType: "lead_assignment",
        objectId: persisted.id,
        metadata: {
          lead_id: persisted.lead_id,
          previous_broker_id: persisted.previous_broker_id,
          broker_id: persisted.broker_id,
          assignment_method: persisted.assignment_method,
        },
      },
      persisted.assigned_at,
    );
  }
  return { ...persisted, idempotent: resolved.idempotent };
}

// The dedicated /api/admin/lead-pipeline/outcome route records a richer audit
// entry than the bulk "handle" path does, and both runtimes agree on each. The
// entry is therefore the caller's to build: `onRecorded` fires exactly once,
// only when a row was actually appended.
export async function recordLeadPipelineOutcomeOperation({ ledgers, journey, input, principal, recordedAt, onRecorded } = {}) {
  const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
  // Always read the ledger we are about to append to, so the transition guard
  // and the idempotency check see the rows that are actually stored.
  const outcomes = await ledgers.leadPipelineOutcomes.read();
  const resolved = resolveLeadPipelineOutcome({ ...journey, outcomes }, outcomes, bound, recordedAt);
  if (!resolved.idempotent) {
    await ledgers.leadPipelineOutcomes.append(resolved.outcome);
    if (typeof onRecorded === "function") onRecorded(resolved, recordedAt);
  }
  return resolved;
}

export async function recordSellerPipelineOutcomeOperation({
  ledgers,
  sellerPipelines,
  input,
  principal,
  recordedAt,
  onRecorded,
} = {}) {
  const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
  const rows = await ledgers.sellerPipelineOutcomes.read();
  const resolved = resolveSellerPipelineOutcome(sellerPipelines, rows, bound, recordedAt);
  if (!resolved.idempotent) {
    await ledgers.sellerPipelineOutcomes.append(resolved.outcome);
    if (typeof onRecorded === "function") onRecorded(resolved, recordedAt);
  }
  return resolved;
}

// "Handled" is recorded on the pipeline the enquiry actually belongs to: a
// seller pipeline note, or a buyer/renter pipeline note. Both are the existing
// single-item paths, with their own validation and their own audit action.
export async function recordLeadHandledOperation({ ledgers, journey, input, principal, recordedAt, audit } = {}) {
  const write = auditWith(audit);
  const leadId = String(input.leadId || input.lead_id || "").trim();
  if (!(journey.leads || []).some((row) => row.lead_id === leadId)) throw new Error("Handled requires a known leadId");
  const sellerPipelines = journey.sellerPipelines || [];
  const sellerPipeline = sellerPipelines.find((row) => row.lead_id === leadId);
  if (sellerPipeline) {
    const result = await recordSellerPipelineOutcomeOperation({
      ledgers,
      sellerPipelines,
      input: { ...input, action: "note", note: input.note || input.reason, sellerPipelineId: sellerPipeline.id },
      principal,
      recordedAt,
      onRecorded: ({ outcome }) =>
        write(
          {
            action: "seller_pipeline_outcome_recorded",
            actor: outcome.actor,
            objectType: "seller_pipeline_outcome",
            objectId: outcome.id,
            metadata: {
              lead_id: outcome.lead_id,
              seller_pipeline_id: outcome.seller_pipeline_id,
              outcome_action: outcome.action,
            },
          },
          recordedAt,
        ),
    });
    return { kind: "seller_pipeline_note", ...result };
  }
  const result = await recordLeadPipelineOutcomeOperation({
    ledgers,
    journey,
    input: { ...input, action: "note", note: input.note || input.reason },
    principal,
    recordedAt,
    onRecorded: ({ outcome }) =>
      write(
        {
          action: "lead_pipeline_outcome_recorded",
          actor: outcome.actor,
          objectType: "lead_pipeline_outcome",
          objectId: outcome.id,
          metadata: {
            lead_id: outcome.lead_id,
            pipeline: outcome.pipeline,
            outcome_action: outcome.action,
            from_stage: outcome.from_stage,
            to_stage: outcome.to_stage,
          },
        },
        recordedAt,
      ),
  });
  return { kind: "lead_pipeline_note", ...result };
}

export async function recordDealCloseOperation({ ledgers, journey, input, principal, closedAt, audit } = {}) {
  const write = auditWith(audit);
  const bound = bindAuthenticatedOperator(input, principal, ["broker"]);
  const rows = await ledgers.deals.read();
  const resolved = resolveClosedDeal({ ...journey, deals: rows }, rows, bound, closedAt);
  const persisted = await persist(ledgers.deals, resolved);
  if (!resolved.idempotent) {
    write(
      {
        action: "deal_closed",
        actor: persisted.broker,
        objectType: "deal",
        objectId: persisted.id,
        locale: persisted.original_language,
        metadata: { lead_id: persisted.lead_id, listing_reference: persisted.listing_reference, status: persisted.status },
      },
      // Both runtimes date this audit entry with their own default clock.
      undefined,
    );
  }
  return { ...persisted, idempotent: resolved.idempotent };
}

/**
 * One approval, one audit entry PER ENQUIRY. A refusal on one enquiry never
 * discards the rest: every item reports its own outcome, and the caller turns
 * the tally into 200 / 201 / 207.
 */
export async function applyLeadBulkOperation({ ledgers, journey, input, principal, recordedAt, audit } = {}) {
  const action = String(input.action || "").trim();
  if (!BULK_ACTIONS.has(action)) throw new Error("Bulk action must be assign, snooze, or handle");
  const submittedIds = input.leadIds ?? input.lead_ids;
  const leadIds = [
    ...new Set(
      (Array.isArray(submittedIds) ? submittedIds : String(submittedIds || "").split(","))
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!leadIds.length) throw new Error("Bulk actions require at least one leadId");
  if (leadIds.length > MAX_BULK_LEADS) throw new Error(`Bulk actions accept ${MAX_BULK_LEADS} enquiries or fewer`);
  const confirmed = input.bulkConfirmed ?? input.bulk_confirmed;
  if (confirmed !== true && !["true", "on", "1"].includes(String(confirmed || ""))) {
    throw new Error("Bulk actions require one explicit human confirmation");
  }

  const results = [];
  for (const leadId of leadIds) {
    try {
      const itemInput = { ...input, leadId, leadIds: undefined, lead_ids: undefined };
      const shared = { ledgers, input: itemInput, principal, recordedAt, audit };
      const outcome =
        action === "assign"
          ? await recordLeadAssignmentOperation({ ...shared, leads: journey.leads })
          : action === "snooze"
            ? await recordLeadSnoozeOperation({ ...shared, leads: journey.leads })
            : await recordLeadHandledOperation({ ...shared, journey });
      results.push({
        lead_id: leadId,
        status: outcome.idempotent ? "unchanged" : "applied",
        idempotent: Boolean(outcome.idempotent),
        record_id: outcome.id || outcome.outcome?.id || null,
      });
    } catch (error) {
      results.push({ lead_id: leadId, status: "refused", idempotent: false, record_id: null, message: error.message });
    }
  }
  const applied = results.filter((row) => row.status === "applied").length;
  const refused = results.filter((row) => row.status === "refused").length;
  return {
    status: refused ? 207 : applied ? 201 : 200,
    body: {
      kind: "lead_bulk_action",
      action,
      requested: leadIds.length,
      applied,
      unchanged: results.filter((row) => row.status === "unchanged").length,
      refused,
      results,
    },
  };
}
