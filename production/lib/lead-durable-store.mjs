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
  };
}

// Enabled only when the operator asked for it AND the runtime it needs is
// actually configured, so a half-provisioned deployment keeps using the file
// ledger instead of failing every submission.
export function isLeadDurableStoreEnabled(config = leadDurableStoreConfigFromEnv()) {
  return Boolean(config.leadDurableStoreEnabled && config.payloadSecret && config.databaseUrl);
}

function assertPayloadWriter(runtime) {
  if (!runtime || typeof runtime.create !== "function" || typeof runtime.find !== "function") {
    throw new Error("Payload runtime cannot read and write lead collections");
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

async function findOne(payload, collection, where) {
  const result = await payload.find({ collection, depth: 0, overrideAccess: true, pagination: false, limit: 1, where });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs[0] || null;
}

export async function findLeadByIdempotencyKey(idempotencyKey, { payload = null } = {}) {
  if (!idempotencyKey) return null;
  const runtime = await runtimePayload(payload);
  return findOne(runtime, "public_leads", { idempotency_key: { equals: idempotencyKey } });
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
  if (ledgerRow.contact || ledgerRow.email || ledgerRow.phone) {
    throw new Error("The durable ledger row must not contain raw contact data");
  }
  // Validated before any write: a malformed envelope is a caller defect, not a
  // store outage, and must not be reported as one.
  if (contactEnvelope && (!contactEnvelope.ciphertext || !contactEnvelope.iv || !contactEnvelope.auth_tag)) {
    throw new Error("The contact envelope must be encrypted before it is stored");
  }

  const runtime = await runtimePayload(payload);

  // Idempotency first: a retry must not create a second person, and a
  // duplicate lead_id must never overwrite the original.
  const byKey = ledgerRow.idempotency_key
    ? await findOne(runtime, "public_leads", { idempotency_key: { equals: ledgerRow.idempotency_key } })
    : null;
  if (byKey) return { lead: byKey.ledger_row || byKey, created: false, idempotent: true };
  const byId = await findOne(runtime, "public_leads", { lead_id: { equals: leadId } });
  if (byId) return { lead: byId.ledger_row || byId, created: false, idempotent: true };

  try {
    await runtime.create({
      collection: "public_leads",
      overrideAccess: true,
      data: {
        lead_id: leadId,
        idempotency_key: ledgerRow.idempotency_key || null,
        received_at: ledgerRow.received_at,
        source: ledgerRow.source,
        intent: ledgerRow.intent || null,
        lead_type: ledgerRow.lead_type,
        listing_reference: ledgerRow.listing_reference || null,
        original_language: ledgerRow.original_language,
        admin_locale: ledgerRow.admin_locale,
        contact_preference: ledgerRow.contact_preference || null,
        assigned_broker: ledgerRow.assigned_broker || null,
        assignment_method: ledgerRow.assignment_method || null,
        contact_fingerprint: ledgerRow.contact_fingerprint || null,
        duplicate_status: ledgerRow.duplicate_status || null,
        possible_duplicate_of: ledgerRow.possible_duplicate_of || null,
        sla_due_at: ledgerRow.sla_due_at || null,
        manager_escalation_due_at: ledgerRow.manager_escalation_due_at || null,
        ledger_row: ledgerRow,
      },
    });

    if (contactEnvelope) {
      await runtime.create({
        collection: "lead_contacts",
        overrideAccess: true,
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
    }
  } catch (error) {
    // Never answer 201 for an enquiry that was not actually stored.
    throw new LeadStoreUnavailableError("Durable lead store rejected the submission", error);
  }

  return { lead: ledgerRow, created: true, idempotent: false };
}
