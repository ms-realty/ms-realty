import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { approvedPublicSeedFixture, approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const CONTACT_SECRET = "viewing-trip-contact-secret-32-characters";
const ADMIN_TOKEN = "viewing-trip-admin-token-0001";
const STORE_CONFIG = {
  viewingDurableStoreEnabled: true,
  payloadSecret: "p".repeat(40),
  databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
  contactSecret: CONTACT_SECRET,
  workspaceId: "workspace-sandanski",
};

function tripInput() {
  return {
    locale: "en",
    arrivalDate: "2026-10-05",
    departureDate: "2026-10-08",
    areas: ["Sandanski", "Petrich"],
    listingReferences: ["MS-CRAWL-0001"],
    partySize: 2,
    note: "Controlled durable-store test.",
    contact: { name: "Trip Visitor", phone: "+31612345678" },
    contact_preference: "phone",
    idempotencyKey: "viewing-trip-durable-runtime-1",
  };
}

function tripInputWith(overrides = {}) {
  return {
    ...tripInput(),
    ...overrides,
    contact: {
      ...tripInput().contact,
      ...(overrides.contact || {}),
    },
  };
}

function tempStoragePaths(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    directory,
    consentLedgerPath: path.join(directory, "consents.jsonl"),
    publicContactVaultPath: path.join(directory, "public-contact-vault.jsonl"),
    publicRequestOutcomeLedgerPath: path.join(directory, "public-request-outcomes.jsonl"),
    viewingTripLedgerPath: path.join(directory, "viewing-trip-requests.jsonl"),
  };
}

function payloadRuntime() {
  const collections = new Map();
  const rows = (collection) => {
    if (!collections.has(collection)) collections.set(collection, []);
    return collections.get(collection);
  };
  const matchesWhere = (row, where) => {
    if (!where) return true;
    if (Array.isArray(where.and)) return where.and.every((clause) => matchesWhere(row, clause));
    if (Array.isArray(where.or)) return where.or.some((clause) => matchesWhere(row, clause));
    return Object.entries(where).every(([field, condition]) => {
      if (field === "and" || field === "or") return true;
      if (!condition || typeof condition !== "object") return false;
      if (Object.hasOwn(condition, "equals")) return row?.[field] === condition.equals;
      if (Object.hasOwn(condition, "in")) return Array.isArray(condition.in) && condition.in.includes(row?.[field]);
      return false;
    });
  };
  let transactionNumber = 0;
  return {
    collections,
    db: {
      async beginTransaction() {
        transactionNumber += 1;
        return `tx-${transactionNumber}`;
      },
      async commitTransaction() {},
      async rollbackTransaction() {},
    },
    async find({ collection, where, limit }) {
      const docs = rows(collection).filter((row) => matchesWhere(row, where));
      return { docs: Number.isFinite(limit) ? docs.slice(0, limit) : docs };
    },
    async create({ collection, data }) {
      const doc = { id: `${collection}-${rows(collection).length + 1}`, ...data };
      rows(collection).push(doc);
      return doc;
    },
  };
}

async function withAdminCredentials(fn) {
  const previous = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "owner_admin", token: ADMIN_TOKEN, roles: ["admin"], workspace_ids: [STORE_CONFIG.workspaceId] },
  ]);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous;
  }
}

async function postNextViewingTrip(config, input = tripInput()) {
  return renderAppApiResponse(
    new Request("https://example.test/api/viewing-trips", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.test" },
      body: JSON.stringify(input),
    }),
    { config },
  );
}

test("Next viewing-trip intake uses the durable store without touching file ledgers", async () => {
  const storage = tempStoragePaths("ms-realty-viewing-trip-next-");
  const payload = payloadRuntime();
  const config = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_PUBLIC_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_VIEWING_TRIP_LEDGER_PATH: storage.viewingTripLedgerPath,
    MS_REALTY_PUBLIC_CONTACT_VAULT_PATH: storage.publicContactVaultPath,
    MS_REALTY_CONSENT_LEDGER_PATH: storage.consentLedgerPath,
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  });
  config.viewingDurablePayload = payload;

  const created = await postNextViewingTrip(config);
  const body = await created.json();
  assert.equal(created.status, 201);
  assert.equal(body.ledger.durable, true);
  assert.equal(body.contactVault.durable, true);
  assert.equal(body.contact, undefined);
  assert.equal(fs.existsSync(config.viewingTripLedgerPath), false);
  assert.equal(fs.existsSync(config.publicContactVaultPath), false);
  assert.equal(payload.collections.get("viewing_trip_requests").length, 1);
  assert.equal(payload.collections.get("lead_contacts").length, 1);
  assert.equal(payload.collections.get("viewing_trip_requests")[0].workspace_id, STORE_CONFIG.workspaceId);
  assert.equal(payload.collections.get("lead_contacts")[0].subject_type, "viewing_trip");
  assert.equal(JSON.stringify(payload.collections.get("viewing_trip_requests")[0]).includes("+31612345678"), false);
  assert.match(payload.collections.get("viewing_trip_requests")[0].semantic_hash, /^[a-f0-9]{64}$/);
  assert.equal(payload.collections.get("viewing_trip_requests")[0].semantic_hash.includes("+31612345678"), false);
  assert.equal(payload.collections.get("viewing_trip_requests")[0].semantic_hash.includes("Trip Visitor"), false);
  assert.equal(payload.collections.get("viewing_trip_requests")[0].semantic_hash.includes("Controlled durable-store test."), false);

  const retry = await postNextViewingTrip(config);
  const retryBody = await retry.json();
  assert.equal(retry.status, 201);
  assert.equal(retryBody.ledger.id, body.id);
  assert.equal(payload.collections.get("viewing_trip_requests").length, 1);
  assert.equal(payload.collections.get("lead_contacts").length, 1);
});

test("durable viewing-trip semantic hash stays stable for the same input and secret", async () => {
  const payloadA = payloadRuntime();
  const payloadB = payloadRuntime();
  const storageA = tempStoragePaths("ms-realty-viewing-trip-stable-a-");
  const storageB = tempStoragePaths("ms-realty-viewing-trip-stable-b-");
  const baseEnv = {
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_PUBLIC_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  };
  const configA = appApiConfigFromEnv({ ...baseEnv, MS_REALTY_CONSENT_LEDGER_PATH: storageA.consentLedgerPath });
  const configB = appApiConfigFromEnv({ ...baseEnv, MS_REALTY_CONSENT_LEDGER_PATH: storageB.consentLedgerPath });
  configA.viewingDurablePayload = payloadA;
  configB.viewingDurablePayload = payloadB;

  const first = await postNextViewingTrip(configA, tripInputWith({ idempotencyKey: "viewing-trip-durable-runtime-stable-a" }));
  const second = await postNextViewingTrip(configB, tripInputWith({ idempotencyKey: "viewing-trip-durable-runtime-stable-b" }));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const hashA = payloadA.collections.get("viewing_trip_requests")[0].semantic_hash;
  const hashB = payloadB.collections.get("viewing_trip_requests")[0].semantic_hash;
  assert.match(hashA, /^[a-f0-9]{64}$/);
  assert.equal(hashA, hashB);
});

test("durable viewing-trip semantic hash changes when the secret changes without exposing private values", async () => {
  const payloadA = payloadRuntime();
  const payloadB = payloadRuntime();
  const storageA = tempStoragePaths("ms-realty-viewing-trip-secret-a-");
  const storageB = tempStoragePaths("ms-realty-viewing-trip-secret-b-");
  const configA = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_PUBLIC_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_CONSENT_LEDGER_PATH: storageA.consentLedgerPath,
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  });
  const configB = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_PUBLIC_CONTACT_KEY: "alternate-viewing-trip-contact-secret-0001",
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_CONSENT_LEDGER_PATH: storageB.consentLedgerPath,
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  });
  configA.viewingDurablePayload = payloadA;
  configB.viewingDurablePayload = payloadB;

  const first = await postNextViewingTrip(configA, tripInputWith({ idempotencyKey: "viewing-trip-durable-runtime-secret-a" }));
  const second = await postNextViewingTrip(configB, tripInputWith({ idempotencyKey: "viewing-trip-durable-runtime-secret-b" }));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const hashA = payloadA.collections.get("viewing_trip_requests")[0].semantic_hash;
  const hashB = payloadB.collections.get("viewing_trip_requests")[0].semantic_hash;
  assert.notEqual(hashA, hashB);
  assert.equal(hashA.includes("+31612345678"), false);
  assert.equal(hashB.includes("+31612345678"), false);
  assert.equal(hashA.includes("Trip Visitor"), false);
  assert.equal(hashB.includes("Trip Visitor"), false);
});

test("Next durable viewing-trip intake returns 409 when the same idempotency key is reused for different trip content", async () => {
  const payload = payloadRuntime();
  const storage = tempStoragePaths("ms-realty-viewing-trip-conflict-next-");
  const config = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_PUBLIC_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_CONSENT_LEDGER_PATH: storage.consentLedgerPath,
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  });
  config.viewingDurablePayload = payload;

  const created = await postNextViewingTrip(config, tripInput());
  assert.equal(created.status, 201);

  const publicConflict = await postNextViewingTrip(config, tripInputWith({ arrivalDate: "2026-10-06" }));
  assert.equal(publicConflict.status, 409);
  assert.deepEqual(await publicConflict.json(), {
    kind: "viewing_trip_conflict",
    message: "This viewing trip idempotency key already belongs to a different request",
  });

  const privateConflict = await postNextViewingTrip(config, tripInputWith({ contact: { phone: "+359881111111" } }));
  assert.equal(privateConflict.status, 409);
  assert.deepEqual(await privateConflict.json(), {
    kind: "viewing_trip_conflict",
    message: "This viewing trip idempotency key already belongs to a different request",
  });

  assert.equal(payload.collections.get("viewing_trip_requests").length, 1);
  assert.equal(payload.collections.get("lead_contacts").length, 1);
});

test("requested durable viewing-trip storage fails closed in Next production when config is incomplete", async () => {
  for (const override of [{ DATABASE_URL: "" }, { MS_REALTY_PUBLIC_CONTACT_KEY: "short" }, { MS_REALTY_WORKSPACE_ID: "" }]) {
    const storage = tempStoragePaths("ms-realty-viewing-trip-incomplete-next-");
    const config = appApiConfigFromEnv({
      ...approvedPublicSeedFixtureEnv(),
      NODE_ENV: "production",
      MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
      MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
      PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
      DATABASE_URL: STORE_CONFIG.databaseUrl,
      MS_REALTY_PUBLIC_CONTACT_KEY: CONTACT_SECRET,
      MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
      MS_REALTY_CONSENT_LEDGER_PATH: storage.consentLedgerPath,
      ...override,
    });

    const response = await postNextViewingTrip(config);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      kind: "viewing_trip_store_unavailable",
      message: "Viewing trip requests are temporarily unavailable.",
    });
  }
});

test("standalone viewing-trip intake uses the durable store and the admin queue reads the same request", async () => {
  const storage = tempStoragePaths("ms-realty-viewing-trip-http-");
  const payload = payloadRuntime();
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    viewingDurableStore: STORE_CONFIG,
    viewingDurablePayload: payload,
    viewingTripLedgerPath: storage.viewingTripLedgerPath,
    publicContactVaultPath: storage.publicContactVaultPath,
    publicContactKey: CONTACT_SECRET,
    consentLedgerPath: storage.consentLedgerPath,
    publicRequestOutcomeLedgerPath: storage.publicRequestOutcomeLedgerPath,
    viewingTripRequestedAt: "2026-08-29T09:00:00.000Z",
    receivedAt: "2026-08-29T09:00:00.000Z",
  });

  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { host: "localhost", origin: "http://localhost" },
    body: tripInput(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ledger.durable, true);
  assert.equal(created.body.contactVault.durable, true);
  assert.equal(fs.existsSync(storage.viewingTripLedgerPath), false);
  assert.equal(fs.existsSync(storage.publicContactVaultPath), false);

  await withAdminCredentials(async () => {
    const queue = await dispatchHttp(app, {
      method: "GET",
      url: "/api/admin/requests",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.publicRequestQueue.summary.viewing_trip_open, 1);
    const trip = queue.body.publicRequestQueue.rows.find((row) => row.request_type === "viewing_trip");
    assert.ok(trip);
    assert.equal(trip.contact.phone, "+31612345678");

    const outcome = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/public-requests/outcome",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
      body: { requestType: "viewing_trip", requestId: created.body.id, action: "contacted", note: "Called to confirm arrival." },
    });
    assert.equal(outcome.status, 201);
    assert.equal(outcome.body.request.request_type, "viewing_trip");
    assert.equal(outcome.body.request.status, "contacted");
  });
});

test("standalone durable viewing-trip intake returns 409 when the same idempotency key is reused for different trip content", async () => {
  const payload = payloadRuntime();
  const storage = tempStoragePaths("ms-realty-viewing-trip-conflict-http-");
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    viewingDurableStore: STORE_CONFIG,
    viewingDurablePayload: payload,
    publicContactKey: CONTACT_SECRET,
    consentLedgerPath: storage.consentLedgerPath,
    viewingTripRequestedAt: "2026-08-29T09:00:00.000Z",
    receivedAt: "2026-08-29T09:00:00.000Z",
  });

  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { host: "localhost", origin: "http://localhost" },
    body: tripInput(),
  });
  assert.equal(created.status, 201);

  const conflict = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { host: "localhost", origin: "http://localhost" },
    body: tripInputWith({ note: "Changed private note." }),
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, {
    kind: "viewing_trip_conflict",
    message: "This viewing trip idempotency key already belongs to a different request",
  });

  assert.equal(payload.collections.get("viewing_trip_requests").length, 1);
  assert.equal(payload.collections.get("lead_contacts").length, 1);
});

test("standalone production also fails closed when durable viewing-trip storage is requested but incomplete", async () => {
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    runtimeDataDurableOnly: true,
    viewingDurableStore: { ...STORE_CONFIG, contactSecret: "short" },
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { host: "localhost", origin: "http://localhost" },
    body: tripInput(),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    kind: "viewing_trip_store_unavailable",
    message: "Viewing trip requests are temporarily unavailable",
  });
});
