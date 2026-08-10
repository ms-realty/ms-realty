import test from "node:test";
import assert from "node:assert/strict";
import { LEAD_COLLECTIONS, LEAD_COLLECTION_SLUGS } from "../lib/lead-collections.mjs";
import { withLeadContactEnvelopes } from "../lib/lead-contact-vault.mjs";
import {
  LeadStoreUnavailableError,
  findLeadByIdempotencyKey,
  isLeadDurableStoreEnabled,
  leadDurableStoreConfigFromEnv,
  persistLeadIntakeDurably,
  persistLeadDurably,
  readLeadIntakesDurably,
} from "../lib/lead-durable-store.mjs";

// A minimal stand-in for the Payload runtime: enough to prove the store's
// ordering, idempotency, and failure behaviour without a database.
function fakePayload({ failOn = null } = {}) {
  const rows = { public_leads: [], lead_contacts: [] };
  let snapshot = null;
  return {
    rows,
    db: {
      async beginTransaction() {
        snapshot = structuredClone(rows);
        return "lead-test-transaction";
      },
      async commitTransaction() {
        snapshot = null;
      },
      async rollbackTransaction() {
        rows.public_leads.splice(0, rows.public_leads.length, ...snapshot.public_leads);
        rows.lead_contacts.splice(0, rows.lead_contacts.length, ...snapshot.lead_contacts);
        snapshot = null;
      },
    },
    async find({ collection, where, limit }) {
      const [field, condition] = Object.entries(where || {})[0] || [];
      const wanted = condition?.equals;
      const docs = rows[collection].filter((row) => row[field] === wanted);
      return { docs: limit ? docs.slice(0, limit) : docs };
    },
    async create({ collection, data }) {
      if (failOn === collection) throw new Error(`${collection} write rejected`);
      rows[collection].push(data);
      return data;
    },
  };
}

const ledgerRow = (overrides = {}) => ({
  lead_id: "lead-draft-11111111-1111-4111-8111-111111111111",
  idempotency_key: null,
  received_at: "2026-08-10T09:00:00.000Z",
  source: "website_listing_detail",
  intent: "inquiry",
  lead_type: "buyer",
  original_language: "he",
  admin_locale: "en",
  contact_preference: "whatsapp",
  contact_fingerprint: "fp-abc",
  duplicate_status: "new_contact",
  sla_due_at: "2026-08-10T09:15:00.000Z",
  ...overrides,
});

const envelope = (overrides = {}) => ({
  subject_type: "lead",
  subject_id: "lead-draft-11111111-1111-4111-8111-111111111111",
  stored_at: "2026-08-10T09:00:00.000Z",
  algorithm: "aes-256-gcm",
  iv: "aXYtYmFzZTY0",
  auth_tag: "dGFnLWJhc2U2NA==",
  ciphertext: "Y2lwaGVydGV4dA==",
  ...overrides,
});

test("the durable store stays off unless it is both requested and configured", () => {
  const base = {
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "s".repeat(40),
    DATABASE_URL: "postgres://x/y",
    MS_REALTY_LEAD_CONTACT_KEY: "c".repeat(32),
  };
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv(base)), true);
  // The runtime adapters use this false result plus the requested flag to fail
  // closed; it must never silently fall back to the file ledger.
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, DATABASE_URL: "" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, PAYLOAD_SECRET: "" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, MS_REALTY_LEAD_CONTACT_KEY: "short" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "false" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({})), false);
});

test("a lead persists with its encrypted contact envelope and no plaintext", async () => {
  const payload = fakePayload();
  const result = await persistLeadDurably({ ledgerRow: ledgerRow(), contactEnvelope: envelope(), payload });

  assert.equal(result.created, true);
  assert.equal(result.idempotent, false);
  assert.equal(payload.rows.public_leads.length, 1);
  assert.equal(payload.rows.lead_contacts.length, 1);

  const stored = payload.rows.public_leads[0];
  assert.equal(stored.lead_id, ledgerRow().lead_id);
  assert.deepEqual(stored.ledger_row, ledgerRow());
  const storedContact = payload.rows.lead_contacts[0];
  assert.equal(storedContact.ciphertext, "Y2lwaGVydGV4dA==");
  // Nothing readable about the person may reach the database.
  const serialized = JSON.stringify(payload.rows);
  for (const plaintext of ["whatsapp:+359", "Noa", "@example"]) {
    assert.equal(serialized.includes(plaintext), false, `${plaintext} must not be stored`);
  }
});

test("a retried submission collapses onto the original record", async () => {
  const payload = fakePayload();
  const row = ledgerRow({ idempotency_key: "browser-retry-1" });
  const first = await persistLeadDurably({ ledgerRow: row, contactEnvelope: envelope(), payload });
  const second = await persistLeadDurably({
    ledgerRow: { ...row, lead_id: "lead-draft-22222222-2222-4222-8222-222222222222" },
    contactEnvelope: envelope({ subject_id: "lead-draft-22222222-2222-4222-8222-222222222222" }),
    payload,
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(payload.rows.public_leads.length, 1, "a retry must not create a second person");
  assert.equal(second.lead.lead_id, row.lead_id, "the original record is returned");

  const found = await findLeadByIdempotencyKey("browser-retry-1", { payload });
  assert.equal(found.lead_id, row.lead_id);
  assert.equal(await findLeadByIdempotencyKey(null, { payload }), null);
});

test("an intake retry reports the contact row belonging to the original lead", async () => {
  const payload = fakePayload();
  const input = (id) => ({
    id: `inbox-${id}`,
    lead: {
      id,
      idempotency_key: "browser-retry-intake-1",
      source: "website_contact_callback",
      intent: "callback",
      leadType: "general",
      contact: { name: "Storage Probe", phone: "+359000000000" },
    },
    original_language: "en",
    admin_locale: "en",
    contact_preference: "phone",
  });
  const firstId = ledgerRow().lead_id;
  const secondId = "lead-draft-22222222-2222-4222-8222-222222222222";
  await persistLeadIntakeDurably({
    lead: input(firstId),
    contactSecret: "test-only-durable-contact-key-32-characters-minimum",
    receivedAt: "2026-08-10T09:00:00.000Z",
    payload,
  });
  const retry = await persistLeadIntakeDurably({
    lead: input(secondId),
    contactSecret: "test-only-durable-contact-key-32-characters-minimum",
    receivedAt: "2026-08-10T09:01:00.000Z",
    payload,
  });

  assert.equal(retry.lead.lead_id, firstId);
  assert.equal(retry.contactVault.lead_id, firstId);
  assert.equal(retry.contactVault.stored_at, "2026-08-10T09:00:00.000Z");
});

test("durable lead messages stay encrypted and authorized readback reconstructs them", async () => {
  const payload = fakePayload();
  const contactSecret = "test-only-durable-contact-key-32-characters-minimum";
  const message = "Test Buyer asks for +359000000000 or test-buyer@example.invalid.";
  const lead = {
    id: "inbox-private-message",
    message_original: message,
    lead: {
      id: ledgerRow().lead_id,
      source: "website_contact_callback",
      intent: "callback",
      leadType: "general",
      contact: { name: "Test Buyer", phone: "+359000000000", email: "test-buyer@example.invalid" },
      request_details: { message, nested: { message_original: message }, callback_time: "Tomorrow" },
    },
    original_language: "en",
    admin_locale: "en",
    contact_preference: "phone",
  };

  await persistLeadIntakeDurably({ lead, contactSecret, receivedAt: "2026-08-10T09:00:00.000Z", payload });

  const publicSerialized = JSON.stringify(payload.rows.public_leads);
  for (const plaintext of [message, "Test Buyer", "+359000000000", "test-buyer@example.invalid"]) {
    assert.equal(publicSerialized.includes(plaintext), false, `${plaintext} must not enter public_leads`);
  }
  assert.equal(payload.rows.public_leads[0].ledger_row.show_original_available, true);
  assert.equal("message_original" in payload.rows.public_leads[0].ledger_row, false);
  assert.deepEqual(payload.rows.public_leads[0].ledger_row.request_details, {
    nested: {},
    callback_time: "Tomorrow",
  });

  const joined = withLeadContactEnvelopes(
    [payload.rows.public_leads[0].ledger_row],
    payload.rows.lead_contacts,
    { secret: contactSecret },
  );
  assert.equal(joined[0].message_original, message);
  assert.deepEqual(joined[0].contact, lead.lead.contact);
  assert.equal(joined[0].contact_available, true);
});

test("durable admin readback joins only matching encrypted contacts", async () => {
  const payload = fakePayload();
  const contactSecret = "test-only-durable-contact-key-32-characters-minimum";
  const message = "Please call the durable lead only.";
  const lead = {
    id: "inbox-durable-readback",
    message_original: message,
    lead: {
      id: ledgerRow().lead_id,
      source: "website_contact_callback",
      intent: "callback",
      leadType: "general",
      contact: { name: "Durable Buyer", email: "durable@example.invalid" },
    },
    original_language: "en",
    admin_locale: "en",
    contact_preference: "email",
  };

  await persistLeadIntakeDurably({ lead, contactSecret, receivedAt: "2026-08-10T09:00:00.000Z", payload });
  payload.rows.lead_contacts.push(envelope({ subject_id: "orphan-fixture-lead", ciphertext: "not-valid-base64" }));

  const leads = await readLeadIntakesDurably({ contactSecret, payload });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].lead_id, lead.lead.id);
  assert.deepEqual(leads[0].contact, lead.lead.contact);
  assert.equal(leads[0].message_original, message);
  assert.equal(leads[0].contact_available, true);
});

test("durable admin readback fails closed when Payload cannot be read", async () => {
  const payload = fakePayload();
  payload.find = async () => {
    throw new Error("database unavailable");
  };

  await assert.rejects(
    () =>
      readLeadIntakesDurably({
        contactSecret: "test-only-durable-contact-key-32-characters-minimum",
        payload,
      }),
    (error) => error instanceof LeadStoreUnavailableError && error.code === "lead_store_unavailable",
  );
});

test("a repeated lead id never overwrites the original", async () => {
  const payload = fakePayload();
  await persistLeadDurably({ ledgerRow: ledgerRow(), contactEnvelope: envelope(), payload });
  const again = await persistLeadDurably({
    ledgerRow: ledgerRow({ source: "website_contact_callback" }),
    contactEnvelope: envelope(),
    payload,
  });
  assert.equal(again.created, false);
  assert.equal(payload.rows.public_leads.length, 1);
  assert.equal(payload.rows.public_leads[0].source, "website_listing_detail", "the first write wins");
});

test("a failed write raises rather than reporting a stored lead", async () => {
  const payload = fakePayload({ failOn: "public_leads" });
  await assert.rejects(
    () => persistLeadDurably({ ledgerRow: ledgerRow(), contactEnvelope: envelope(), payload }),
    (error) => error instanceof LeadStoreUnavailableError && error.code === "lead_store_unavailable",
  );

  // A contact-store failure must also fail loudly: a lead nobody can answer is
  // worse than a refused submission.
  const contactFailure = fakePayload({ failOn: "lead_contacts" });
  await assert.rejects(
    () => persistLeadDurably({ ledgerRow: ledgerRow(), contactEnvelope: envelope(), payload: contactFailure }),
    LeadStoreUnavailableError,
  );
  assert.equal(contactFailure.rows.public_leads.length, 0, "lead and contact must roll back together");
  assert.equal(contactFailure.rows.lead_contacts.length, 0);
});

test("the store refuses malformed input outright", async () => {
  const payload = fakePayload();
  await assert.rejects(() => persistLeadDurably({ payload }), /ledger row is required/i);
  await assert.rejects(() => persistLeadDurably({ ledgerRow: { source: "x" }, payload }), /lead_id/);
  await assert.rejects(
    () => persistLeadDurably({ ledgerRow: ledgerRow({ contact: { name: "Noa" } }), payload }),
    /must not contain raw contact data/,
  );
  await assert.rejects(
    () => persistLeadDurably({ ledgerRow: ledgerRow({ message_original: "private" }), contactEnvelope: envelope(), payload }),
    /must not contain a plaintext message/,
  );
  await assert.rejects(
    () =>
      persistLeadDurably({
        ledgerRow: ledgerRow({ request_details: { nested: { message: "private" } } }),
        contactEnvelope: envelope(),
        payload,
      }),
    /must not contain a plaintext message/,
  );
  await assert.rejects(
    () => persistLeadDurably({ ledgerRow: ledgerRow(), contactEnvelope: { subject_id: "x" }, payload }),
    /must be encrypted/,
  );
});

test("the collections keep contact envelopes opaque and ledger rows immutable", () => {
  assert.deepEqual(LEAD_COLLECTION_SLUGS, ["public_leads", "lead_contacts"]);
  const bySlug = Object.fromEntries(LEAD_COLLECTIONS.map((c) => [c.slug, c]));

  const leadFields = Object.fromEntries(bySlug.public_leads.fields.map((f) => [f.name, f]));
  assert.equal(leadFields.lead_id.unique, true);
  assert.equal(leadFields.lead_id.access.update(), false, "identity is immutable once written");
  assert.equal(leadFields.received_at.access.update(), false);
  assert.equal(leadFields.idempotency_key.index, true);
  // No field may invite raw contact data into the ledger collection.
  for (const name of ["contact", "email", "phone", "whatsapp", "message"]) {
    assert.equal(name in leadFields, false, `public_leads must not carry ${name}`);
  }

  const contactFields = Object.fromEntries(bySlug.lead_contacts.fields.map((f) => [f.name, f]));
  for (const name of ["iv", "auth_tag", "ciphertext", "algorithm"]) {
    assert.equal(contactFields[name].required, true);
    assert.equal(contactFields[name].access.update(), false, `${name} is write-once`);
  }
});
