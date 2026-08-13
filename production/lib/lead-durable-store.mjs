import { createLeadContactEnvelope } from "./lead-contact-vault.mjs";
import { containsPlaintextMessageField, createLeadLedgerRow } from "./lead-ledger.mjs";
import { openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { createSellerPipelineItem } from "./seller-pipeline.mjs";

const PLAINTEXT_CONTACT_FIELDS = new Set(["contact", "email", "phone", "whatsapp", "viber"]);
const PRIVATE_EVENT_FIELD_NAMES = new Set([
  "contact",
  "contactname",
  "email",
  "message",
  "messageoriginal",
  "phone",
  "viber",
  "whatsapp",
]);

function containsPlaintextContactField(value) {
  if (Array.isArray(value)) return value.some(containsPlaintextContactField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => PLAINTEXT_CONTACT_FIELDS.has(key.toLowerCase()) || containsPlaintextContactField(nested),
  );
}

function containsPrivateEventField(value) {
  if (Array.isArray(value)) return value.some(containsPrivateEventField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    return PRIVATE_EVENT_FIELD_NAMES.has(normalized) || containsPrivateEventField(nested);
  });
}

function requiredText(value, label, maxLength = 160) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function workspaceIds(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map((entry) => String(entry || "").trim()).filter(Boolean))].sort();
}

function workspaceScopedWhere(workspaceId, clause) {
  return { and: [{ workspace_id: { equals: workspaceId } }, clause] };
}

function forbiddenWorkspaceError() {
  const error = new Error("The authenticated operator is not assigned to the durable lead workspace");
  error.status = 403;
  error.capability = "workspace:access";
  return error;
}

export function leadReadScopeForPrincipal(principal, configuredWorkspaceIds) {
  const configured = workspaceIds(configuredWorkspaceIds);
  const roles = workspaceIds(principal?.roles || principal?.role);
  const admin = roles.includes("admin");
  if (admin) return { admin: true, workspaceIds: configured };
  if (!roles.includes("broker")) throw forbiddenWorkspaceError();
  const assigned = workspaceIds(principal?.workspace_ids);
  const allowed = configured.length ? configured.filter((workspaceId) => assigned.includes(workspaceId)) : assigned;
  if (!allowed.length) throw forbiddenWorkspaceError();
  return { admin: false, workspaceIds: allowed };
}

export function payloadUserForLeadRead(principal, payloadUser = null) {
  if (payloadUser) return payloadUser;
  const roles = workspaceIds(principal?.roles || principal?.role);
  const role = roles.includes("admin") ? "admin" : roles.includes("broker") ? "broker" : "";
  if (!role) return null;
  return {
    collection: "admins",
    id: principal?.payload_user_id || principal?.id || `lead-reader-${role}`,
    role,
    workspace_ids: workspaceIds(principal?.workspace_ids),
  };
}

function assertPrivacySafeEvent(event, { collection, leadId, workspaceId }) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error(`${collection} event is required`);
  if (requiredText(event.lead_id, `${collection} lead_id`) !== leadId) {
    throw new Error(`${collection} event must belong to the stored lead`);
  }
  if (requiredText(event.workspace_id, `${collection} workspace_id`) !== workspaceId) {
    throw new Error(`${collection} event must belong to the stored workspace`);
  }
  requiredText(event.event_id, `${collection} event_id`);
  if (!Number.isFinite(Date.parse(event.recorded_at))) throw new Error(`${collection} recorded_at must be an ISO timestamp`);
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error(`${collection} payload must be an object`);
  }
  if (containsPrivateEventField(event.payload)) {
    throw new Error(`${collection} payload must not contain plaintext contact or message fields`);
  }
  return event;
}

function consentEventFor(ledgerRow, { marketingOptIn = false, workspaceId }) {
  const leadId = ledgerRow.lead_id;
  return {
    event_id: `consent-inquiry-follow-up:${leadId}`,
    workspace_id: workspaceId,
    lead_id: leadId,
    recorded_at: ledgerRow.received_at,
    payload: {
      recorded_at: ledgerRow.received_at,
      consent_type: "inquiry_follow_up",
      source: ledgerRow.source,
      subject_id: leadId,
      locale: ledgerRow.original_language,
      contact_fingerprint: ledgerRow.contact_fingerprint || null,
      granted: true,
      legal_basis: "legitimate_interest",
      marketing_opt_in: marketingOptIn === true,
    },
  };
}

function sellerPipelineEventFor(lead, ledgerRow, { createdAt, workspaceId }) {
  if (ledgerRow.lead_type !== "seller") return null;
  const { contact_name: _contactName, ...payload } = createSellerPipelineItem(lead, {
    createdAt: createdAt || ledgerRow.received_at,
  });
  return {
    event_id: `seller-pipeline-created:${ledgerRow.lead_id}`,
    workspace_id: workspaceId,
    lead_id: ledgerRow.lead_id,
    recorded_at: ledgerRow.received_at,
    payload,
  };
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
    workspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
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
      String(config.contactSecret || "").length >= 32 &&
      String(config.workspaceId || "").trim(),
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

export async function findLeadByIdempotencyKey(idempotencyKey, { payload = null, workspaceId } = {}) {
  if (!idempotencyKey) return null;
  const scope = requiredText(workspaceId, "Durable lead workspace_id");
  const runtime = await runtimePayload(payload);
  return findOne(
    runtime,
    "public_leads",
    workspaceScopedWhere(scope, { idempotency_key: { equals: idempotencyKey } }),
  );
}

export async function readLeadIntakesDurably({ admin = false, contactSecret, payload = null, user = null, workspaceId, workspaceIds: scopeInput } = {}) {
  try {
    const scope = workspaceIds(scopeInput || workspaceId);
    if (!admin && !scope.length) throw forbiddenWorkspaceError();
    const runtime = await runtimePayload(payload);
    const access = user ? { overrideAccess: false, user } : { overrideAccess: true };
    const where = scope.length ? { workspace_id: { in: scope } } : undefined;
    const leadResult = await runtime.find({
      collection: "public_leads",
      depth: 0,
      ...access,
      pagination: false,
      ...(where ? { where } : {}),
    });
    if (!Array.isArray(leadResult?.docs)) throw new Error("Payload public_leads query did not return documents");

    const allowed = new Set(scope);
    const leadWorkspaces = new Map();
    const leads = leadResult.docs.map((document) => {
      const documentWorkspaceId = requiredText(document?.workspace_id, "Payload public_leads workspace_id");
      if (allowed.size && !allowed.has(documentWorkspaceId)) {
        throw new Error("Payload public_leads query crossed the requested workspace boundary");
      }
      const lead = document?.ledger_row;
      if (!lead?.lead_id || lead.lead_id !== document.lead_id) throw new Error("Payload public_leads ledger_row is invalid");
      if (containsPlaintextContactField(lead)) {
        throw new Error("Payload public_leads ledger_row contains plaintext contact data");
      }
      if (containsPlaintextMessageField(lead)) {
        throw new Error("Payload public_leads ledger_row contains a plaintext message");
      }
      leadWorkspaces.set(lead.lead_id, documentWorkspaceId);
      return { ...lead, workspace_id: documentWorkspaceId };
    });
    // Leads are append-only. Taking their snapshot first ensures the later
    // contact snapshot cannot omit an envelope for a lead we already saw.
    const contactResult = await runtime.find({
      collection: "lead_contacts",
      depth: 0,
      ...access,
      pagination: false,
      ...(where ? { where } : {}),
    });
    if (!Array.isArray(contactResult?.docs)) throw new Error("Payload lead_contacts query did not return documents");
    const leadIds = new Set(leads.map((lead) => lead.lead_id));
    const contacts = new Map();
    for (const envelope of contactResult.docs) {
      const envelopeWorkspaceId = requiredText(envelope?.workspace_id, "Payload lead_contacts workspace_id");
      if (allowed.size && !allowed.has(envelopeWorkspaceId)) {
        throw new Error("Payload lead_contacts query crossed the requested workspace boundary");
      }
      if (envelope?.subject_type !== "lead" || !leadIds.has(envelope.subject_id)) continue;
      if (leadWorkspaces.get(envelope.subject_id) !== envelopeWorkspaceId) {
        throw new Error("Payload lead contact envelope crossed its lead workspace boundary");
      }
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
    if (error?.status === 403) throw error;
    throw new LeadStoreUnavailableError("Durable lead store read failed", error);
  }
}

export async function persistLeadIntakeDurably({
  lead,
  contactSecret,
  marketingOptIn = false,
  payload = null,
  receivedAt,
  sellerPipelineCreatedAt,
  workspaceId,
} = {}) {
  const durableWorkspaceId = requiredText(workspaceId, "Durable lead workspace_id");
  const ledgerRow = createLeadLedgerRow(lead, { receivedAt, contactSecret });
  const contactEnvelope = createLeadContactEnvelope(lead, { secret: contactSecret, storedAt: receivedAt });
  const consentEvent = consentEventFor(ledgerRow, { marketingOptIn, workspaceId: durableWorkspaceId });
  const sellerPipelineEvent = sellerPipelineEventFor(lead, ledgerRow, {
    createdAt: sellerPipelineCreatedAt,
    workspaceId: durableWorkspaceId,
  });
  const result = await persistLeadDurably({ consentEvent, contactEnvelope, ledgerRow, payload, sellerPipelineEvent });
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
 * Persist one public lead, encrypted contact, consent event, and (for sellers)
 * pipeline event in one durable transaction. A retry returns the original
 * business records rather than creating a second person.
 */
export async function persistLeadDurably({
  consentEvent,
  contactEnvelope,
  ledgerRow,
  payload = null,
  sellerPipelineEvent = null,
} = {}) {
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
  const workspaceId = requiredText(consentEvent?.workspace_id, "consent_events workspace_id");
  assertPrivacySafeEvent(consentEvent, { collection: "consent_events", leadId, workspaceId });
  if (ledgerRow.lead_type === "seller" && !sellerPipelineEvent) {
    throw new Error("Seller leads require a seller_pipeline_events event");
  }
  if (ledgerRow.lead_type !== "seller" && sellerPipelineEvent) {
    throw new Error("Only seller leads may create a seller_pipeline_events event");
  }
  if (sellerPipelineEvent) {
    assertPrivacySafeEvent(sellerPipelineEvent, { collection: "seller_pipeline_events", leadId, workspaceId });
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
      ? await findOne(
          runtime,
          "public_leads",
          workspaceScopedWhere(workspaceId, { idempotency_key: { equals: ledgerRow.idempotency_key } }),
          req,
        )
      : null;
    const byId = byKey
      ? null
      : await findOne(runtime, "public_leads", workspaceScopedWhere(workspaceId, { lead_id: { equals: leadId } }), req);
    const existing = byKey || byId;
    if (existing) {
      const existingLead = existing.ledger_row || existing;
      const existingLeadId = requiredText(existingLead.lead_id, "Stored lead_id");
      if (requiredText(existing.workspace_id, "Stored lead workspace_id") !== workspaceId) {
        throw new Error("Stored lead belongs to another workspace");
      }
      const storedConsent = await findOne(
        runtime,
        "consent_events",
        workspaceScopedWhere(workspaceId, { lead_id: { equals: existingLeadId } }),
        req,
      );
      if (!storedConsent?.payload) throw new Error("Stored lead is missing its transactional consent event");
      const storedSellerPipeline =
        existingLead.lead_type === "seller"
          ? await findOne(
              runtime,
              "seller_pipeline_events",
              workspaceScopedWhere(workspaceId, { lead_id: { equals: existingLeadId } }),
              req,
            )
          : null;
      if (existingLead.lead_type === "seller" && !storedSellerPipeline?.payload) {
        throw new Error("Stored seller lead is missing its transactional pipeline event");
      }
      await runtime.db.commitTransaction(transactionId);
      committed = true;
      return {
        lead: existingLead,
        consent: storedConsent.payload,
        sellerPipeline: storedSellerPipeline?.payload || null,
        created: false,
        idempotent: true,
      };
    }

    const possibleDuplicate = ledgerRow.contact_fingerprint
      ? await findOne(
          runtime,
          "public_leads",
          workspaceScopedWhere(workspaceId, { contact_fingerprint: { equals: ledgerRow.contact_fingerprint } }),
          req,
        )
      : null;
    const storedRow = possibleDuplicate
      ? { ...ledgerRow, duplicate_status: "possible_duplicate", possible_duplicate_of: possibleDuplicate.lead_id }
      : ledgerRow;

    await runtime.create({
      collection: "public_leads",
      overrideAccess: true,
      req,
      data: {
        workspace_id: workspaceId,
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
        workspace_id: workspaceId,
        subject_type: contactEnvelope.subject_type || "lead",
        subject_id: contactEnvelope.subject_id || leadId,
        stored_at: contactEnvelope.stored_at,
        algorithm: contactEnvelope.algorithm,
        iv: contactEnvelope.iv,
        auth_tag: contactEnvelope.auth_tag,
        ciphertext: contactEnvelope.ciphertext,
      },
    });
    await runtime.create({ collection: "consent_events", overrideAccess: true, req, data: consentEvent });
    if (sellerPipelineEvent) {
      await runtime.create({ collection: "seller_pipeline_events", overrideAccess: true, req, data: sellerPipelineEvent });
    }
    await runtime.db.commitTransaction(transactionId);
    committed = true;
    return {
      lead: storedRow,
      consent: consentEvent.payload,
      sellerPipeline: sellerPipelineEvent?.payload || null,
      created: true,
      idempotent: false,
    };
  } catch (error) {
    if (transactionId && !committed) await runtime.db.rollbackTransaction(transactionId).catch(() => undefined);
    // Never answer 201 for an enquiry that was not actually stored.
    throw new LeadStoreUnavailableError("Durable lead store rejected the submission", error);
  }
}
