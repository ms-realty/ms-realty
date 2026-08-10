import { createLeadContactEnvelope } from "./lead-contact-vault.mjs";
import { containsPlaintextMessageField, createLeadLedgerRow } from "./lead-ledger.mjs";
import { openPrivateContactEnvelope } from "./private-contact-vault.mjs";

const PLAINTEXT_CONTACT_FIELDS = new Set(["contact", "email", "phone", "whatsapp", "viber"]);

function containsPlaintextContactField(value) {
  if (Array.isArray(value)) return value.some(containsPlaintextContactField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => PLAINTEXT_CONTACT_FIELDS.has(key.toLowerCase()) || containsPlaintextContactField(nested),
  );
}

// Durable persistence for public lead intake, following the same shape as the
// realty-case Payload authority: a lazily-imported Payload runtime, explicit
// configuration, and a hard failure rather than a silent fallback when the
// store is enabled but unreachable.
//
// The privacy model is unchanged. The ledger row written here is the same
// privacy-safe row the JSONL ledger holds, and the contact row carries only
// the AES-256-GCM envelope the file vault already produces — Postgres never
// receives plaintext contact details.
export class LeadStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "LeadStoreUnavailableError";
    this.code = "lead_store_unavailable";
    if (cause) this.cause = cause;
  }
}

export function leadDurableStoreConfigFromEnv(env = process.env) {
  return {
    leadDurableStoreEnabled: String(env.MS_REALTY_LEAD_DURABLE_STORE_ENABLED || "").trim() === "true",
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    contactSecret: String(env.MS_REALTY_LEAD_CONTACT_KEY || ""),
  };
}

// Enabled only when the operator asked for it AND the runtime it needs is
// actually configured. Runtime adapters separately detect an operator-requested
// but incomplete configuration and fail closed instead of using the file ledger.
export function isLeadDurableStoreEnabled(config = leadDurableStoreConfigFromEnv()) {
  return Boolean(
    config.leadDurableStoreEnabled &&
      config.payloadSecret &&
      config.databaseUrl &&
      String(config.contactSecret || "").length >= 32,
  );
}

function assertPayloadWriter(runtime) {
  if (!runtime || typeof runtime.create !== "function" || typeof runtime.find !== "function") {
    throw new Error("Payload runtime cannot read and write lead collections");
  }
  if (
    !runtime.db ||
    typeof runtime.db.beginTransaction !== "function" ||
    typeof runtime.db.commitTransaction !== "function" ||
    typeof runtime.db.rollbackTransaction !== "function"
  ) {
    throw new Error("Payload database adapter must support transactions");
  }
  return runtime;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadWriter(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadWriter(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new LeadStoreUnavailableError("Durable lead store runtime is unavailable", error);
  }
}

async function findOne(payload, collection, where, req = undefined) {
  const result = await payload.find({ collection, depth: 0, overrideAccess: true, pagination: false, limit: 1, req, where });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs[0] || null;
}

export async function findLeadByIdempotencyKey(idempotencyKey, { payload = null } = {}) {
  if (!idempotencyKey) return null;
  const runtime = await runtimePayload(payload);
  return findOne(runtime, "public_leads", { idempotency_key: { equals: idempotencyKey } });
}

export async function readLeadIntakesDurably({ contactSecret, payload = null } = {}) {
  try {
    const runtime = await runtimePayload(payload);
    const leadResult = await runtime.find({ collection: "public_leads", depth: 0, overrideAccess: true, pagination: false });
    if (!Array.isArray(leadResult?.docs)) throw new Error("Payload public_leads query did not return documents");

    const leads = leadResult.docs.map((document) => {
      const lead = document?.ledger_row;
      if (!lead?.lead_id || lead.lead_id !== document.lead_id) throw new Error("Payload public_leads ledger_row is invalid");
      if (containsPlaintextContactField(lead)) {
        throw new Error("Payload public_leads ledger_row contains plaintext contact data");
      }
      if (containsPlaintextMessageField(lead)) {
        throw new Error("Payload public_leads ledger_row contains a plaintext message");
      }
      return lead;
    });
    // Leads are append-only. Taking their snapshot first ensures the later
    // contact snapshot cannot omit an envelope for a lead we already saw.
    const contactResult = await runtime.find({ collection: "lead_contacts", depth: 0, overrideAccess: true, pagination: false });
    if (!Array.isArray(contactResult?.docs)) throw new Error("Payload lead_contacts query did not return documents");
    const leadIds = new Set(leads.map((lead) => lead.lead_id));
    const contacts = new Map();
    for (const envelope of contactResult.docs) {
      if (envelope?.subject_type !== "lead" || !leadIds.has(envelope.subject_id)) continue;
      const opened = openPrivateContactEnvelope(envelope, {
        secret: contactSecret,
        secretName: "MS_REALTY_LEAD_CONTACT_KEY",
      });
      if (!contacts.has(opened.subject_id)) contacts.set(opened.subject_id, opened.payload);
    }

    return leads.map((lead) => {
      const contact = contacts.get(lead.lead_id);
      if (!contact) throw new Error(`Payload lead ${lead.lead_id} has no encrypted contact envelope`);
      return { ...lead, ...contact, contact_available: true };
    });
  } catch (error) {
    if (error instanceof LeadStoreUnavailableError) throw error;
    throw new LeadStoreUnavailableError("Durable lead store read failed", error);
  }
}

export async function persistLeadIntakeDurably({ lead, contactSecret, receivedAt, payload = null } = {}) {
  const ledgerRow = createLeadLedgerRow(lead, { receivedAt, contactSecret });
  const contactEnvelope = createLeadContactEnvelope(lead, { secret: contactSecret, storedAt: receivedAt });
  const result = await persistLeadDurably({ ledgerRow, contactEnvelope, payload });
  return {
    ...result,
    contactVault: {
      lead_id: result.lead.lead_id,
      stored_at: result.created ? contactEnvelope.stored_at : result.lead.received_at,
      encrypted: true,
      durable: true,
    },
  };
}

/**
 * Persist one public lead and its encrypted contact envelope in a durable
 * store. Returns the stored ledger row plus whether this call created it, so
 * a retried submission can answer 200 with the original rather than 201.
 */
export async function persistLeadDurably({ ledgerRow, contactEnvelope, payload = null } = {}) {
  if (!ledgerRow || typeof ledgerRow !== "object") throw new Error("A privacy-safe ledger row is required");
  const leadId = String(ledgerRow.lead_id || "").trim();
  if (!leadId) throw new Error("The ledger row must carry a lead_id");
  if (containsPlaintextContactField(ledgerRow)) {
    throw new Error("The durable ledger row must not contain raw contact data");
  }
  if (containsPlaintextMessageField(ledgerRow)) {
    throw new Error("The durable ledger row must not contain a plaintext message");
  }
  // Validated before any write: a malformed envelope is a caller defect, not a
  // store outage, and must not be reported as one.
  if (!contactEnvelope || !contactEnvelope.ciphertext || !contactEnvelope.iv || !contactEnvelope.auth_tag) {
    throw new Error("The contact envelope must be encrypted before it is stored");
  }
  if ((contactEnvelope.subject_type || "lead") !== "lead" || (contactEnvelope.subject_id || leadId) !== leadId) {
    throw new Error("The contact envelope must belong to the stored lead");
  }

  const runtime = await runtimePayload(payload);
  let transactionId = null;
  let committed = false;
  try {
    transactionId = await runtime.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
    if (!transactionId) throw new Error("Payload database adapter did not open a transaction");
    const req = { payload: runtime, transactionID: transactionId };

    // Idempotency is checked inside the transaction: a retry must not create a
    // second person, and a repeated lead_id never overwrites the original.
    const byKey = ledgerRow.idempotency_key
      ? await findOne(runtime, "public_leads", { idempotency_key: { equals: ledgerRow.idempotency_key } }, req)
      : null;
    const byId = byKey ? null : await findOne(runtime, "public_leads", { lead_id: { equals: leadId } }, req);
    const existing = byKey || byId;
    if (existing) {
      await runtime.db.commitTransaction(transactionId);
      committed = true;
      return { lead: existing.ledger_row || existing, created: false, idempotent: true };
    }

    const possibleDuplicate = ledgerRow.contact_fingerprint
      ? await findOne(runtime, "public_leads", { contact_fingerprint: { equals: ledgerRow.contact_fingerprint } }, req)
      : null;
    const storedRow = possibleDuplicate
      ? { ...ledgerRow, duplicate_status: "possible_duplicate", possible_duplicate_of: possibleDuplicate.lead_id }
      : ledgerRow;

    await runtime.create({
      collection: "public_leads",
      overrideAccess: true,
      req,
      data: {
        lead_id: leadId,
        idempotency_key: storedRow.idempotency_key || null,
        received_at: storedRow.received_at,
        source: storedRow.source,
        intent: storedRow.intent || null,
        lead_type: storedRow.lead_type,
        listing_reference: storedRow.listing_reference || null,
        original_language: storedRow.original_language,
        admin_locale: storedRow.admin_locale,
        contact_preference: storedRow.contact_preference || null,
        assigned_broker: storedRow.assigned_broker || null,
        assignment_method: storedRow.assignment_method || null,
        contact_fingerprint: storedRow.contact_fingerprint || null,
        duplicate_status: storedRow.duplicate_status || null,
        possible_duplicate_of: storedRow.possible_duplicate_of || null,
        sla_due_at: storedRow.sla_due_at || null,
        manager_escalation_due_at: storedRow.manager_escalation_due_at || null,
        ledger_row: storedRow,
      },
    });

    await runtime.create({
      collection: "lead_contacts",
      overrideAccess: true,
      req,
      data: {
        subject_type: contactEnvelope.subject_type || "lead",
        subject_id: contactEnvelope.subject_id || leadId,
        stored_at: contactEnvelope.stored_at,
        algorithm: contactEnvelope.algorithm,
        iv: contactEnvelope.iv,
        auth_tag: contactEnvelope.auth_tag,
        ciphertext: contactEnvelope.ciphertext,
      },
    });
    await runtime.db.commitTransaction(transactionId);
    committed = true;
    return { lead: storedRow, created: true, idempotent: false };
  } catch (error) {
    if (transactionId && !committed) await runtime.db.rollbackTransaction(transactionId).catch(() => undefined);
    // Never answer 201 for an enquiry that was not actually stored.
    throw new LeadStoreUnavailableError("Durable lead store rejected the submission", error);
  }
}
