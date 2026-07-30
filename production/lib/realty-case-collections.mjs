// Payload collection definitions for the durable RealtyCase projection. These are
// intentionally schema-only: the preview SQLite/JSONL ledger remains the runtime
// writer until the transactional projector lands.

export const REALTY_CASE_PAYLOAD_COLLECTION_SLUGS = [
  "realty_cases",
  "realty_case_conditions",
  "realty_case_condition_events",
  "realty_case_events",
  "realty_case_mandate_versions",
  "realty_case_evidence",
  "realty_case_outbox",
];

export const REALTY_CASE_ACTIONS = [
  "case_opened",
  "step_completed",
  "step_not_applicable",
  "step_blocked",
  "step_reopened",
  "mode_changed",
  "case_frozen",
  "case_resumed",
  "case_closed",
  "case_cancelled",
];

export const REALTY_CASE_CONDITION_ACTIONS = [
  "condition_opened",
  "condition_satisfied",
  "condition_blocked",
  "condition_expired",
  "condition_waived",
  "condition_reopened",
];

export const REALTY_CASE_CONDITION_STATUSES = ["open", "satisfied", "blocked", "expired", "waived"];

const CASE_TYPES = [
  "buyer_purchase",
  "seller_sale",
  "tenant_rental",
  "landlord_rental",
  "short_term_rental",
  "property_management",
];
const ASSET_KINDS = ["residential", "commercial", "land", "new_build", "mixed_use"];
const EVIDENCE_PRODUCERS = [
  "agency",
  "agent",
  "bank",
  "client",
  "counterparty",
  "engineer",
  "insurer",
  "lawyer",
  "notary",
  "property_manager",
  "registry",
  "system",
  "tax_authority",
  "vendor",
];

const FORBIDDEN_REFERENCE_PAYLOAD_KEYS = new Set([
  "base64",
  "binary",
  "body",
  "content",
  "document_content",
  "file",
  "file_data",
  "raw_content",
]);

function containsDocumentContent(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsDocumentContent);
  return Object.entries(value).some(
    ([key, nested]) => FORBIDDEN_REFERENCE_PAYLOAD_KEYS.has(String(key).toLowerCase()) || containsDocumentContent(nested),
  );
}

export function validateReferenceOnlyJSON(value) {
  if (value === null || value === undefined) return true;
  if (containsDocumentContent(value)) {
    return "Reference payloads must not contain document content, files, or encoded binary data";
  }
  return true;
}

const immutableField = {
  access: { update: () => false },
  admin: { readOnly: true },
};

const appendOnlyAccess = () => ({ update: () => false, delete: () => false });

const workspaceField = () => ({
  name: "workspace_id",
  type: "text",
  required: true,
  index: true,
  maxLength: 160,
  admin: { description: "Tenant/workspace boundary. Never infer this from a case reference." },
});

const referencePayloadField = (name, { required = false } = {}) => ({
  name,
  type: "json",
  required,
  validate: validateReferenceOnlyJSON,
  admin: { description: "Reference-only JSON. Document content, files, and binary data are prohibited." },
});

export const REALTY_CASE_COLLECTIONS = [
  {
    slug: "realty_cases",
    admin: {
      useAsTitle: "case_id",
      defaultColumns: ["workspace_id", "case_id", "jurisdiction", "case_type", "status", "last_event_at"],
    },
    fields: [
      workspaceField(),
      { name: "case_id", type: "text", required: true, index: true, maxLength: 160 },
      { name: "jurisdiction", type: "select", required: true, options: ["BG", "GR"] },
      { name: "case_type", type: "select", required: true, options: CASE_TYPES },
      { name: "asset_kind", type: "select", required: true, options: ASSET_KINDS },
      { name: "client_ref", type: "text", required: true, maxLength: 240, admin: { description: "Reference only." } },
      { name: "property_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "execution_mode", type: "select", required: true, options: ["manual", "autonomous"] },
      { name: "status", type: "select", required: true, defaultValue: "active", options: ["active", "frozen", "closed", "cancelled"] },
      { name: "assurance_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "mandate_ref", type: "text", required: true, maxLength: 240, admin: { description: "Reference only." } },
      { name: "mandate_version_number", type: "number", required: true, min: 1 },
      { name: "mandate_digest", type: "text", required: true, maxLength: 160 },
      { name: "workflow_version", type: "text", required: true, maxLength: 160, ...immutableField },
      {
        name: "workflow_snapshot",
        type: "json",
        required: true,
        ...immutableField,
        admin: { readOnly: true, description: "Immutable workflow snapshot captured when the case opens." },
      },
      { name: "workflow_snapshot_digest", type: "text", required: true, maxLength: 160, ...immutableField },
      { name: "current_phase", type: "text", required: true, maxLength: 80 },
      { name: "progress_percent", type: "number", required: true, defaultValue: 0, min: 0, max: 100 },
      { name: "last_event_sequence", type: "number", required: true, defaultValue: 1, min: 1 },
      { name: "last_event_id", type: "text", required: true, maxLength: 160 },
      { name: "last_event_action", type: "select", required: true, options: REALTY_CASE_ACTIONS },
      { name: "last_event_at", type: "date", required: true },
    ],
  },
  {
    slug: "realty_case_conditions",
    admin: {
      useAsTitle: "condition_id",
      defaultColumns: ["workspace_id", "condition_id", "case", "condition_type", "status", "due_at"],
    },
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "condition_id", type: "text", required: true, index: true, maxLength: 160 },
      { name: "condition_type", type: "text", required: true, maxLength: 120 },
      { name: "due_at", type: "date", required: true },
      referencePayloadField("required_evidence_producer_refs", { required: true }),
      { name: "status", type: "select", required: true, defaultValue: "open", options: REALTY_CASE_CONDITION_STATUSES },
      referencePayloadField("evidence_refs", { required: true }),
      { name: "authority_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "reason_code", type: "text", maxLength: 160 },
      { name: "last_event_sequence", type: "number", required: true, defaultValue: 1, min: 1 },
      { name: "last_event_id", type: "text", required: true, maxLength: 600 },
      { name: "last_event_action", type: "select", required: true, options: REALTY_CASE_CONDITION_ACTIONS },
      { name: "last_event_at", type: "date", required: true },
      { name: "last_actor_ref", type: "text", required: true, maxLength: 160, admin: { description: "Reference only." } },
    ],
  },
  {
    slug: "realty_case_condition_events",
    admin: {
      useAsTitle: "event_id",
      defaultColumns: ["workspace_id", "event_id", "case", "condition", "action", "recorded_at"],
    },
    access: appendOnlyAccess(),
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "condition", type: "relationship", relationTo: "realty_case_conditions", required: true },
      { name: "event_id", type: "text", required: true, index: true, maxLength: 600 },
      { name: "sequence", type: "number", required: true, min: 1 },
      { name: "action", type: "select", required: true, options: REALTY_CASE_CONDITION_ACTIONS },
      { name: "actor_ref", type: "text", required: true, maxLength: 160, admin: { description: "Reference only." } },
      { name: "executor_kind", type: "select", required: true, options: ["human", "agent"] },
      { name: "assurance_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "authority_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "reason_code", type: "text", maxLength: 160 },
      referencePayloadField("reference_payload", { required: true }),
      { name: "payload_digest", type: "text", required: true, maxLength: 160 },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 600 },
      { name: "recorded_at", type: "date", required: true },
    ],
  },
  {
    slug: "realty_case_events",
    admin: {
      useAsTitle: "event_id",
      defaultColumns: ["workspace_id", "event_id", "case", "sequence", "action", "recorded_at"],
    },
    access: appendOnlyAccess(),
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "event_id", type: "text", required: true, index: true, maxLength: 160 },
      { name: "sequence", type: "number", required: true, min: 1 },
      { name: "action", type: "select", required: true, options: REALTY_CASE_ACTIONS },
      { name: "step_key", type: "text", maxLength: 160 },
      { name: "actor_ref", type: "text", required: true, maxLength: 160, admin: { description: "Reference only." } },
      { name: "executor_kind", type: "select", required: true, options: ["human", "agent"] },
      { name: "assurance_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "authority_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "reason_code", type: "text", maxLength: 160 },
      referencePayloadField("reference_payload", { required: true }),
      { name: "payload_digest", type: "text", required: true, maxLength: 160 },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240 },
      { name: "recorded_at", type: "date", required: true },
    ],
  },
  {
    slug: "realty_case_mandate_versions",
    admin: {
      useAsTitle: "mandate_ref",
      defaultColumns: ["workspace_id", "mandate_ref", "version_number", "case", "status", "expires_at"],
    },
    access: appendOnlyAccess(),
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "mandate_ref", type: "text", required: true, index: true, maxLength: 240, admin: { description: "Reference only." } },
      { name: "version_number", type: "number", required: true, min: 1 },
      {
        name: "status",
        type: "select",
        required: true,
        defaultValue: "active",
        options: ["active", "superseded", "revoked", "expired"],
        admin: { description: "Immutable status at append time; the parent case identifies the current mandate version." },
      },
      { name: "granted_by_ref", type: "text", required: true, maxLength: 240, admin: { description: "Reference only." } },
      { name: "signed_at", type: "date", required: true },
      { name: "expires_at", type: "date" },
      { name: "signed_evidence_ref", type: "text", required: true, maxLength: 240, admin: { description: "Reference only." } },
      referencePayloadField("capabilities", { required: true }),
      referencePayloadField("limits"),
      { name: "mandate_digest", type: "text", required: true, maxLength: 160 },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240 },
    ],
  },
  {
    slug: "realty_case_evidence",
    admin: {
      useAsTitle: "evidence_ref",
      defaultColumns: ["workspace_id", "evidence_ref", "case", "evidence_type", "producer_kind", "verification_status"],
    },
    access: appendOnlyAccess(),
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "source_event", type: "relationship", relationTo: "realty_case_events" },
      { name: "evidence_ref", type: "text", required: true, index: true, maxLength: 240, admin: { description: "Reference only." } },
      {
        name: "evidence_type",
        type: "select",
        required: true,
        options: [
          "identity_assertion",
          "registry_extract",
          "financial_confirmation",
          "inspection",
          "contract",
          "communication_receipt",
          "provider_receipt",
          "document_metadata",
          "other",
        ],
      },
      { name: "producer_kind", type: "select", required: true, options: EVIDENCE_PRODUCERS },
      { name: "producer_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      { name: "issued_at", type: "date" },
      { name: "digest", type: "text", required: true, maxLength: 160 },
      { name: "storage_ref", type: "text", maxLength: 240, admin: { description: "Encrypted-vault reference only; no document content." } },
      { name: "mime_type", type: "text", maxLength: 160 },
      { name: "retention_class", type: "select", required: true, options: ["case_file", "legal_hold", "short_lived"] },
      { name: "verification_status", type: "select", required: true, defaultValue: "pending", options: ["pending", "verified", "rejected", "expired", "revoked"] },
      { name: "verification_ref", type: "text", maxLength: 240, admin: { description: "Reference only." } },
      referencePayloadField("metadata_refs"),
    ],
  },
  {
    slug: "realty_case_outbox",
    admin: {
      useAsTitle: "outbox_id",
      defaultColumns: ["workspace_id", "outbox_id", "case", "kind", "status", "not_before"],
    },
    fields: [
      workspaceField(),
      { name: "case", type: "relationship", relationTo: "realty_cases", required: true },
      { name: "source_event", type: "relationship", relationTo: "realty_case_events" },
      { name: "outbox_id", type: "text", required: true, index: true, maxLength: 160 },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240 },
      { name: "kind", type: "select", required: true, options: ["provider_request", "communication", "calendar_task", "webhook", "reconciliation"] },
      { name: "destination_ref", type: "text", required: true, maxLength: 240, admin: { description: "Provider or channel reference only." } },
      referencePayloadField("payload_refs", { required: true }),
      { name: "payload_digest", type: "text", required: true, maxLength: 160 },
      { name: "status", type: "select", required: true, defaultValue: "pending", options: ["pending", "leased", "delivered", "failed", "dead_letter", "cancelled"] },
      { name: "not_before", type: "date", required: true },
      { name: "lease_until", type: "date" },
      { name: "attempt_count", type: "number", required: true, defaultValue: 0, min: 0 },
      { name: "last_attempt_at", type: "date" },
      { name: "last_error_code", type: "text", maxLength: 160 },
      { name: "delivered_at", type: "date" },
    ],
  },
];
