// Durable storage for admin lead operations.
//
// The lead inbox writes its workflow state — snoozes, assignments, pipeline
// outcomes, deals — as append-only JSONL on the runtime's disk. On Cloudflare
// that disk resets whenever the container sleeps, which is why
// lead-durable-boundary.mjs refuses these mutations outright once durable lead
// intake is on: accepting one would split a single lead across Postgres and
// storage that is about to disappear.
//
// This module gives those verbs the same durable authority the lead intake and
// viewing stores already have. One append-only collection holds every
// operation, discriminated by `operation`, carrying the ledger row verbatim in
// `row`. The rows are contact-free by construction — the file ledgers already
// assert that (assertLeadSnoozes, assertLeadAssignments,
// assertLeadPipelineOutcomes, assertSellerPipelineOutcomes all reject contact
// and message fields) — so no envelope is needed here. The assertion is
// repeated below rather than assumed: a row that grew a contact field must fail
// the write, not leak into Postgres.
const PRIVATE_FIELD_NAMES = new Set([
  "contact",
  "contactname",
  "email",
  "message",
  "messageoriginal",
  "phone",
  "reviewedreply",
  "viber",
  "whatsapp",
]);

// One collection, discriminated by operation. Each value names the file ledger
// it replaces, so a reader can trace a durable row back to its file writer.
export const LEAD_OPERATIONS = Object.freeze({
  snooze: "lead_snooze", // lead-snoozes.mjs (snooze and unsnooze rows)
  assignment: "lead_assignment", // lead-assignments.mjs
  leadPipelineOutcome: "lead_pipeline_outcome", // lead-pipeline-outcomes.mjs
  sellerPipelineOutcome: "seller_pipeline_outcome", // seller-pipeline-outcomes.mjs
  deal: "deal", // deal-ledger.mjs
});

const OPERATION_VALUES = new Set(Object.values(LEAD_OPERATIONS));

const COLLECTION = "lead_operations";
const denyAccess = () => false;

export const LEAD_OPERATION_COLLECTION = {
  slug: COLLECTION,
  // Server-owned append-only state. The application is the only writer, and it
  // always writes with overrideAccess; nothing reaches this through the admin UI.
  access: { create: denyAccess, read: denyAccess, update: denyAccess, delete: denyAccess },
  admin: { hidden: true, useAsTitle: "operation_key" },
  fields: [
    // `${workspace_id}:${operation}:${operation_id}` — the idempotency anchor.
    // A retried write collapses onto the original row instead of appending a
    // second one, exactly as the file writers' sameIntent checks do.
    { name: "operation_key", type: "text", required: true, unique: true, index: true, maxLength: 400 },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160 },
    { name: "operation", type: "text", required: true, index: true, maxLength: 64 },
    { name: "operation_id", type: "text", required: true, index: true, maxLength: 200 },
    // Accounts and other lead-less operations may leave this null; every verb
    // migrated so far carries one.
    { name: "lead_id", type: "text", index: true, maxLength: 160 },
    { name: "actor", type: "text", maxLength: 160 },
    { name: "recorded_at", type: "date", required: true, index: true },
    {
      name: "row",
      type: "json",
      required: true,
      admin: { description: "The ledger row exactly as the JSONL ledger stores it. Never contact or message content." },
    },
  ],
};

export class LeadOperationStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "LeadOperationStoreUnavailableError";
    this.code = "lead_operation_store_unavailable";
    if (cause) this.cause = cause;
  }
}

export function leadOperationsDurableStoreConfigFromEnv(env = process.env) {
  return {
    leadOperationsDurableStoreEnabled: String(env.MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED || "").trim() === "true",
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    workspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
  };
}

// Enabled only when the operator asked for it AND the runtime it needs is
// configured. An operator-requested but incomplete configuration is detected by
// the callers, which fail closed rather than silently using the file ledger.
export function isLeadOperationsDurableStoreEnabled(config = leadOperationsDurableStoreConfigFromEnv()) {
  return Boolean(
    config?.leadOperationsDurableStoreEnabled && config.payloadSecret && config.databaseUrl && String(config.workspaceId || "").trim(),
  );
}

function containsPrivateField(value) {
  if (Array.isArray(value)) return value.some(containsPrivateField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    return PRIVATE_FIELD_NAMES.has(normalized) || containsPrivateField(nested);
  });
}

function requiredText(value, label, maxLength = 200) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function assertOperation(operation) {
  const value = requiredText(operation, "Lead operation", 64);
  if (!OPERATION_VALUES.has(value)) throw new Error(`Unknown lead operation "${value}"`);
  return value;
}

function operationKey(workspaceId, operation, operationId) {
  return `${workspaceId}:${operation}:${operationId}`;
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function") {
    throw new Error("Payload runtime cannot read and write lead operations");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new LeadOperationStoreUnavailableError("Durable lead operation runtime is unavailable", error);
  }
}

function rowFromDocument(document, { operation, workspaceId }) {
  if (requiredText(document?.workspace_id, "Stored lead operation workspace_id", 160) !== workspaceId) {
    throw new Error("Stored lead operation belongs to another workspace");
  }
  if (document?.operation !== operation) throw new Error("Stored lead operation has an unexpected operation type");
  const row = document?.row;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Stored lead operation row is invalid");
  if (String(row.id || "").trim() !== String(document.operation_id || "").trim()) {
    throw new Error("Stored lead operation row id does not match its operation_id");
  }
  if (containsPrivateField(row)) throw new Error("Stored lead operation row contains contact or message content");
  return row;
}

/**
 * Every stored row for one operation kind, in the order it was appended.
 *
 * Order is load-bearing: the snooze ledger's "latest open snooze" and the
 * pipeline ledgers' chronological guards both read an append-ordered sequence.
 * Payload's serial `id` preserves insertion order, so it — not recorded_at,
 * which callers may pin to the same instant — is the sort key.
 */
export async function readLeadOperationsDurably({ operation, payload = null, workspaceId } = {}) {
  const kind = assertOperation(operation);
  const scope = requiredText(workspaceId, "Durable lead operation workspace_id", 160);
  try {
    const runtime = await runtimePayload(payload);
    const result = await runtime.find({
      collection: COLLECTION,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: "id",
      where: { and: [{ workspace_id: { equals: scope } }, { operation: { equals: kind } }] },
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload lead_operations query did not return documents");
    return result.docs.map((document) => rowFromDocument(document, { operation: kind, workspaceId: scope }));
  } catch (error) {
    if (error instanceof LeadOperationStoreUnavailableError) throw error;
    throw new LeadOperationStoreUnavailableError("Durable lead operation read failed", error);
  }
}

/**
 * Append one operation row.
 *
 * The caller has already applied the ledger's own rules (validation, transition
 * guards, and the same-intent idempotency check against the rows this store
 * returned). This adds the last-writer guard: two concurrent requests that
 * minted the same row id collapse onto the stored row rather than appending
 * twice, which is the behaviour the file writers get from their re-read.
 */
export async function appendLeadOperationDurably({ operation, payload = null, row, workspaceId } = {}) {
  const kind = assertOperation(operation);
  const scope = requiredText(workspaceId, "Durable lead operation workspace_id", 160);
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("A lead operation row is required");
  const operationId = requiredText(row.id, "Lead operation row id");
  // Validated before any write: a row carrying contact data is a caller defect,
  // not a store outage, and must never be reported as one.
  if (containsPrivateField(row)) throw new Error("Lead operation rows must not contain contact or message content");
  const recordedAt = row.recorded_at || row.assigned_at || row.closed_at || row.received_at;
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error("Lead operation row must carry an ISO timestamp");

  const key = operationKey(scope, kind, operationId);
  const data = {
    operation_key: key,
    workspace_id: scope,
    operation: kind,
    operation_id: operationId,
    lead_id: row.lead_id ? String(row.lead_id) : null,
    actor: String(row.actor || row.assigned_by || row.broker || "").trim() || null,
    recorded_at: new Date(recordedAt).toISOString(),
    row,
  };

  try {
    const runtime = await runtimePayload(payload);
    const stored = await findByOperationKey(runtime, key);
    if (stored) return { row: rowFromDocument(stored, { operation: kind, workspaceId: scope }), idempotent: true };
    try {
      const created = await runtime.create({ collection: COLLECTION, data, depth: 0, overrideAccess: true });
      return { row: rowFromDocument(created, { operation: kind, workspaceId: scope }), idempotent: false };
    } catch (error) {
      // A concurrent writer may have committed the same key between the read
      // and the insert. Only this already-classified race gets a reread.
      const raced = await findByOperationKey(runtime, key);
      if (raced) return { row: rowFromDocument(raced, { operation: kind, workspaceId: scope }), idempotent: true };
      throw error;
    }
  } catch (error) {
    if (error instanceof LeadOperationStoreUnavailableError) throw error;
    throw new LeadOperationStoreUnavailableError("Durable lead operation store rejected the write", error);
  }
}

async function findByOperationKey(runtime, key) {
  const result = await runtime.find({
    collection: COLLECTION,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { operation_key: { equals: key } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload lead_operations query did not return documents");
  return result.docs[0] || null;
}
