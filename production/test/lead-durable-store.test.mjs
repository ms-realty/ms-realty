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
  const rows = { public_leads: [], lead_contacts: [], consent_events: [], seller_pipeline_events: [] };
  const calls = { create: [], find: [] };
  let snapshot = null;
  return {
    calls,
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
        for (const collection of Object.keys(rows)) {
          rows[collection].splice(0, rows[collection].length, ...snapshot[collection]);
        }
        snapshot = null;
      },
    },
    async find(input) {
      calls.find.push(input);
      const { collection, where, limit } = input;
      const [field, condition] = Object.entries(where || {})[0] || [];
      const wanted = condition?.equals;
      const docs = rows[collection].filter((row) => row[field] === wanted);
      return { docs: limit ? docs.slice(0, limit) : docs };
    },
    async create(input) {
      calls.create.push(input);
      const { collection, data } = input;
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

const consentEvent = (row = ledgerRow(), overrides = {}) => ({
  event_id: `consent-inquiry-follow-up:${row.lead_id}`,
  workspace_id: "workspace-sandanski",
  lead_id: row.lead_id,
  recorded_at: row.received_at,
  payload: {
    recorded_at: row.received_at,
    consent_type: "inquiry_follow_up",
    source: row.source,
    subject_id: row.lead_id,
    locale: row.original_language,
    contact_fingerprint: row.contact_fingerprint,
    granted: true,
    legal_basis: "legitimate_interest",
    marketing_opt_in: false,
  },
  ...overrides,
});

const sellerPipelineEvent = (row, overrides = {}) => ({
  event_id: `seller-pipeline-created:${row.lead_id}`,
  workspace_id: "workspace-sandanski",
  lead_id: row.lead_id,
  recorded_at: row.received_at,
  payload: {
    id: `seller-pipeline-${row.lead_id}`,
    lead_id: row.lead_id,
    stage: "valuation_requested",
    status: "open",
  },
  ...overrides,
});

function durableArgs({ ledgerRow: row = ledgerRow(), ...overrides } = {}) {
  return { ledgerRow: row, contactEnvelope: envelope({ subject_id: row.lead_id }), consentEvent: consentEvent(row), ...overrides };
}

test("the durable store stays off unless it is both requested and configured", () => {
  const base = {
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "s".repeat(40),
    DATABASE_URL: "postgres://x/y",
    MS_REALTY_LEAD_CONTACT_KEY: "c".repeat(32),
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
  };
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv(base)), true);
  // The runtime adapters use this false result plus the requested flag to fail
  // closed; it must never silently fall back to the file ledger.
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, DATABASE_URL: "" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, PAYLOAD_SECRET: "" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, MS_REALTY_LEAD_CONTACT_KEY: "short" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, MS_REALTY_WORKSPACE_ID: "" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({ ...base, MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "false" })), false);
  assert.equal(isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv({})), false);
});

test("a lead persists with its encrypted contact envelope and consent event in one transaction", async () => {
  const payload = fakePayload();
  const result = await persistLeadDurably(durableArgs({ payload }));

  assert.equal(result.created, true);
  assert.equal(result.idempotent, false);
  assert.equal(payload.rows.public_leads.length, 1);
  assert.equal(payload.rows.lead_contacts.length, 1);
  assert.equal(payload.rows.consent_events.length, 1);
  assert.equal(payload.rows.seller_pipeline_events.length, 0);
  assert.equal(payload.calls.find.every((call) => call.overrideAccess === true), true);
  assert.equal(payload.calls.create.every((call) => call.overrideAccess === true), true);
  assert.equal(payload.calls.find.every((call) => call.req?.transactionID === "lead-test-transaction"), true);
  assert.equal(payload.calls.create.every((call) => call.req?.transactionID === "lead-test-transaction"), true);

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
  assert.equal(result.consent.consent_type, "inquiry_follow_up");
  assert.equal(payload.rows.consent_events[0].workspace_id, "workspace-sandanski");
});

test("a retried submission collapses onto the original record", async () => {
  const payload = fakePayload();
  const row = ledgerRow({ idempotency_key: "browser-retry-1" });
  const first = await persistLeadDurably(durableArgs({ ledgerRow: row, payload }));
  const retryRow = { ...row, lead_id: "lead-draft-22222222-2222-4222-8222-222222222222" };
  const second = await persistLeadDurably(durableArgs({
    ledgerRow: retryRow,
    payload,
  }));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(payload.rows.public_leads.length, 1, "a retry must not create a second person");
  assert.equal(payload.rows.lead_contacts.length, 1);
  assert.equal(payload.rows.consent_events.length, 1);
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
    workspaceId: "workspace-sandanski",
    payload,
  });
  const retry = await persistLeadIntakeDurably({
    lead: input(secondId),
    contactSecret: "test-only-durable-contact-key-32-characters-minimum",
    receivedAt: "2026-08-10T09:01:00.000Z",
    workspaceId: "workspace-sandanski",
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

  await persistLeadIntakeDurably({
    lead,
    contactSecret,
    receivedAt: "2026-08-10T09:00:00.000Z",
    workspaceId: "workspace-sandanski",
    payload,
  });

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

test("durable persistence strips mixed-case nested plaintext message fields", async () => {
  for (const privateField of ["Message", "MESSAGE_ORIGINAL", "mEsSaGe"]) {
    const payload = fakePayload();
    await persistLeadIntakeDurably({
      lead: {
        id: `inbox-mixed-case-message-${privateField}`,
        lead: {
          id: ledgerRow().lead_id,
          source: "website_contact_callback",
          intent: "callback",
          leadType: "general",
          contact: { name: "Durable Buyer", email: "durable@example.invalid" },
          request_details: {
            nested: [{ safe: "retained" }, { [privateField]: "plaintext private message" }],
          },
        },
        original_language: "en",
        admin_locale: "en",
        contact_preference: "email",
      },
      contactSecret: "test-only-durable-contact-key-32-characters-minimum",
      receivedAt: "2026-08-10T09:00:00.000Z",
      workspaceId: "workspace-sandanski",
      payload,
    });

    assert.equal(JSON.stringify(payload.rows.public_leads).includes("plaintext private message"), false);
    assert.deepEqual(payload.rows.public_leads[0].ledger_row.request_details, {
      nested: [{ safe: "retained" }, {}],
    });
  }
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

  await persistLeadIntakeDurably({
    lead,
    contactSecret,
    receivedAt: "2026-08-10T09:00:00.000Z",
    workspaceId: "workspace-sandanski",
    payload,
  });
  payload.rows.lead_contacts.push(envelope({ subject_id: "orphan-fixture-lead", ciphertext: "not-valid-base64" }));

  const readFindStart = payload.calls.find.length;
  const leads = await readLeadIntakesDurably({ contactSecret, payload });
  assert.deepEqual(
    payload.calls.find.slice(readFindStart).map(({ collection, depth, overrideAccess, pagination }) => ({
      collection,
      depth,
      overrideAccess,
      pagination,
    })),
    [
      { collection: "public_leads", depth: 0, overrideAccess: true, pagination: false },
      { collection: "lead_contacts", depth: 0, overrideAccess: true, pagination: false },
    ],
  );
  assert.equal(leads.length, 1);
  assert.equal(leads[0].lead_id, lead.lead.id);
  assert.deepEqual(leads[0].contact, lead.lead.contact);
  assert.equal(leads[0].message_original, message);
  assert.equal(leads[0].contact_available, true);
});

test("durable admin readback takes the lead snapshot before querying contacts", async () => {
  const payload = fakePayload();
  const contactSecret = "test-only-durable-contact-key-32-characters-minimum";
  await persistLeadIntakeDurably({
    lead: {
      id: "inbox-durable-snapshot-order",
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
    },
    contactSecret,
    receivedAt: "2026-08-10T09:00:00.000Z",
    workspaceId: "workspace-sandanski",
    payload,
  });

  const find = payload.find.bind(payload);
  let releaseLeadQuery;
  let markLeadQueryStarted;
  let contactQueryStarted = false;
  const leadQueryStarted = new Promise((resolve) => {
    markLeadQueryStarted = resolve;
  });
  payload.find = async (query) => {
    if (query.collection === "public_leads") {
      return new Promise((resolve) => {
        releaseLeadQuery = () => resolve(find(query));
        markLeadQueryStarted();
      });
    }
    if (query.collection === "lead_contacts") contactQueryStarted = true;
    return find(query);
  };

  const pendingRead = readLeadIntakesDurably({ contactSecret, payload });
  await leadQueryStarted;
  assert.equal(contactQueryStarted, false, "the contact query must wait for a stable lead snapshot");
  releaseLeadQuery();

  const leads = await pendingRead;
  assert.equal(contactQueryStarted, true);
  assert.equal(leads.length, 1);
});

test("durable admin readback rejects plaintext private fields in stored ledger rows", async () => {
  const payload = fakePayload();
  const contactSecret = "test-only-durable-contact-key-32-characters-minimum";
  await persistLeadIntakeDurably({
    lead: {
      id: "inbox-durable-privacy-readback",
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
    },
    contactSecret,
    receivedAt: "2026-08-10T09:00:00.000Z",
    workspaceId: "workspace-sandanski",
    payload,
  });

  const stored = payload.rows.public_leads[0].ledger_row;
  for (const [field, value, expectedCause] of [
    ["contact", { email: "plaintext@example.invalid" }, /plaintext contact data/],
    ...["email", "phone", "contact", "whatsapp", "viber", "Email", "eMail", "PHONE", "ConTaCt", "WhatsApp", "VIBER"].map((privateField) => [
      "request_details",
      { arbitrary: { nested: { [privateField]: "plaintext private contact" } } },
      /plaintext contact data/,
    ]),
    ["request_details", { nested: { message_original: "plaintext private note" } }, /plaintext message/],
    ...["Message", "MESSAGE_ORIGINAL", "mEsSaGe"].map((privateField) => [
      "request_details",
      { arbitrary: [{ nested: { [privateField]: "plaintext private message" } }] },
      /plaintext message/,
    ]),
  ]) {
    const hadField = Object.hasOwn(stored, field);
    const previous = stored[field];
    stored[field] = value;
    await assert.rejects(
      () => readLeadIntakesDurably({ contactSecret, payload }),
      (error) =>
        error instanceof LeadStoreUnavailableError &&
        error.code === "lead_store_unavailable" &&
        expectedCause.test(error.cause?.message || ""),
    );
    if (hadField) stored[field] = previous;
    else delete stored[field];
  }
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
  await persistLeadDurably(durableArgs({ payload }));
  const again = await persistLeadDurably(durableArgs({ ledgerRow: ledgerRow({ source: "website_contact_callback" }), payload }));
  assert.equal(again.created, false);
  assert.equal(payload.rows.public_leads.length, 1);
  assert.equal(payload.rows.public_leads[0].source, "website_listing_detail", "the first write wins");
});

test("a seller intake atomically creates all four durable records without plaintext side effects", async () => {
  const payload = fakePayload();
  const contactSecret = "test-only-durable-contact-key-32-characters-minimum";
  const result = await persistLeadIntakeDurably({
    lead: {
      id: "inbox-durable-seller",
      message_original: "Please value my apartment and call tomorrow.",
      lead: {
        id: "lead-draft-44444444-4444-4444-8444-444444444444",
        idempotency_key: "durable-seller-intake-1",
        source: "website_seller_valuation",
        intent: "valuation",
        leadType: "seller",
        contact: { name: "Mira Private", phone: "+359000000004" },
        property: { location: "Sandanski", type: "apartment" },
      },
      original_language: "bg",
      admin_locale: "bg",
      contact_preference: "phone",
      broker_assignment: { broker_id: "broker_bg", method: "language_and_location" },
    },
    contactSecret,
    marketingOptIn: true,
    payload,
    receivedAt: "2026-08-10T09:00:00.000Z",
    sellerPipelineCreatedAt: "2026-08-10T09:00:01.000Z",
    workspaceId: "workspace-sandanski",
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(payload.rows).map(([collection, rows]) => [collection, rows.length])),
    { public_leads: 1, lead_contacts: 1, consent_events: 1, seller_pipeline_events: 1 },
  );
  assert.equal(result.consent.marketing_opt_in, true);
  assert.equal(result.sellerPipeline.stage, "valuation_requested");
  assert.equal(result.sellerPipeline.created_at, "2026-08-10T09:00:01.000Z");
  assert.equal("contact_name" in result.sellerPipeline, false);
  const sideEffects = JSON.stringify({ consent: payload.rows.consent_events, seller: payload.rows.seller_pipeline_events });
  for (const plaintext of ["Mira Private", "+359000000004", "Please value my apartment"]) {
    assert.equal(sideEffects.includes(plaintext), false, `${plaintext} must not enter durable side-effect events`);
  }
});

test("event payloads recursively reject contact and message keys case-insensitively", async () => {
  for (const privateField of ["Contact", "EMAIL", "Phone", "WhatsApp", "VIBER", "Message", "MESSAGE_ORIGINAL", "contact-name"]) {
    const payload = fakePayload();
    const row = ledgerRow();
    const event = consentEvent(row, {
      payload: { safe: { nested: [{ retained: true }, { [privateField]: "private" }] } },
    });
    await assert.rejects(
      () => persistLeadDurably(durableArgs({ consentEvent: event, ledgerRow: row, payload })),
      /payload must not contain plaintext contact or message fields/,
    );
    assert.deepEqual(
      Object.values(payload.rows).map((rows) => rows.length),
      [0, 0, 0, 0],
    );
  }
});

test("every seller-intake write rolls the full transaction back on failure", async () => {
  const row = ledgerRow({ lead_type: "seller" });
  for (const collection of ["public_leads", "lead_contacts", "consent_events", "seller_pipeline_events"]) {
    const payload = fakePayload({ failOn: collection });
    await assert.rejects(
      () =>
        persistLeadDurably(
          durableArgs({ ledgerRow: row, payload, sellerPipelineEvent: sellerPipelineEvent(row) }),
        ),
      (error) => error instanceof LeadStoreUnavailableError && error.code === "lead_store_unavailable",
    );
    for (const [storedCollection, rows] of Object.entries(payload.rows)) {
      assert.equal(rows.length, 0, `${storedCollection} must roll back when ${collection} fails`);
    }
  }
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

test("durable persistence rejects mixed-case nested plaintext contact fields before writing", async () => {
  for (const privateField of ["Email", "eMail", "PHONE", "ConTaCt", "WhatsApp", "VIBER"]) {
    const payload = fakePayload();
    await assert.rejects(
      () =>
        persistLeadIntakeDurably({
          lead: {
            id: `inbox-mixed-case-${privateField}`,
            lead: {
              id: ledgerRow().lead_id,
              source: "website_contact_callback",
              intent: "callback",
              leadType: "general",
              contact: { name: "Durable Buyer", email: "durable@example.invalid" },
              request_details: { nested: { [privateField]: "plaintext private contact" } },
            },
            original_language: "en",
            admin_locale: "en",
            contact_preference: "email",
          },
          contactSecret: "test-only-durable-contact-key-32-characters-minimum",
          receivedAt: "2026-08-10T09:00:00.000Z",
          workspaceId: "workspace-sandanski",
          payload,
        }),
      /must not contain raw contact data/,
    );
    assert.equal(payload.rows.public_leads.length, 0);
    assert.equal(payload.rows.lead_contacts.length, 0);
  }
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
