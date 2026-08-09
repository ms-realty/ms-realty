// Durable storage for public lead intake.
//
// Leads, and the encrypted contact details that make them actionable, are
// currently append-only JSONL on the runtime's disk. On Cloudflare that disk
// resets whenever the container sleeps, which is why the Worker blocks public
// writes outright rather than accept an enquiry it would silently lose.
//
// These two collections move that state to Postgres without changing the
// privacy model: the ledger row stays privacy-safe (no raw contact), and the
// contact row stores exactly the AES-256-GCM envelope the file vault already
// produces. Postgres never sees plaintext, and MS_REALTY_LEAD_CONTACT_KEY
// remains the only thing that can open it.
const immutableField = {
  access: { update: () => false },
  admin: { readOnly: true },
};

export const LEAD_COLLECTION_SLUGS = ["public_leads", "lead_contacts"];

export const LEAD_COLLECTIONS = [
  {
    slug: "public_leads",
    admin: {
      useAsTitle: "lead_id",
      defaultColumns: ["lead_id", "received_at", "source", "lead_type", "admin_locale", "assigned_broker"],
    },
    fields: [
      { name: "lead_id", type: "text", required: true, unique: true, index: true, maxLength: 160, ...immutableField },
      // Set only when the submitter supplied one; a repeat collapses onto the
      // original row instead of creating a second person.
      { name: "idempotency_key", type: "text", index: true, maxLength: 128, ...immutableField },
      { name: "received_at", type: "date", required: true, ...immutableField },
      { name: "source", type: "text", required: true, maxLength: 120 },
      { name: "intent", type: "text", maxLength: 80 },
      { name: "lead_type", type: "text", required: true, maxLength: 80 },
      { name: "listing_reference", type: "text", maxLength: 160 },
      { name: "original_language", type: "text", required: true, maxLength: 12 },
      { name: "admin_locale", type: "text", required: true, maxLength: 12 },
      { name: "contact_preference", type: "text", maxLength: 40 },
      { name: "assigned_broker", type: "text", maxLength: 120 },
      { name: "assignment_method", type: "text", maxLength: 80 },
      // A keyed digest of the contact, used to spot likely duplicates without
      // storing anything that identifies the person.
      { name: "contact_fingerprint", type: "text", index: true, maxLength: 160 },
      { name: "duplicate_status", type: "text", maxLength: 40 },
      { name: "possible_duplicate_of", type: "text", maxLength: 160 },
      { name: "sla_due_at", type: "date" },
      { name: "manager_escalation_due_at", type: "date" },
      {
        name: "ledger_row",
        type: "json",
        required: true,
        admin: { description: "The privacy-safe ledger row exactly as the JSONL ledger stores it. Never raw contact data." },
      },
    ],
  },
  {
    slug: "lead_contacts",
    admin: { useAsTitle: "subject_id", defaultColumns: ["subject_id", "subject_type", "stored_at", "algorithm"] },
    fields: [
      { name: "subject_type", type: "text", required: true, maxLength: 40, ...immutableField },
      { name: "subject_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
      { name: "stored_at", type: "date", required: true, ...immutableField },
      { name: "algorithm", type: "text", required: true, maxLength: 40, ...immutableField },
      // The envelope produced by private-contact-vault.mjs. Ciphertext only —
      // the decryption key never reaches the database.
      { name: "iv", type: "text", required: true, maxLength: 64, ...immutableField },
      { name: "auth_tag", type: "text", required: true, maxLength: 64, ...immutableField },
      { name: "ciphertext", type: "textarea", required: true, ...immutableField },
    ],
  },
];
