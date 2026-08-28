import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appendPublicContact } from "../lib/public-contact-vault.mjs";
import { readPublicRequestOutcomes } from "../lib/public-request-outcomes.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const TOKEN = "public-request-route-test-token-0001";
const AUTH = { authorization: `Bearer ${TOKEN}` };
const SECRET = "public-request-contact-key-for-tests-0001";
const VIEWING_SECRET = "public-request-viewing-contact-key-32";

function jsonl(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

async function withCredentials(fn) {
  return withCredentialRows([{ id: "broker_anna", token: TOKEN, roles: ["broker"] }], fn);
}

async function withCredentialRows(rows, fn) {
  const previous = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify(rows);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous;
  }
}

function payloadRuntime() {
  const collections = new Map();
  const docs = (collection) => {
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
      const result = docs(collection).filter((row) => matchesWhere(row, where));
      return { docs: Number.isFinite(limit) ? result.slice(0, limit) : result };
    },
    async create({ collection, data }) {
      const document = { id: `${collection}-${docs(collection).length + 1}`, ...data };
      docs(collection).push(document);
      return document;
    },
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-requests-admin-"));
  const savedSearch = {
    saved_at: "2026-07-18T10:00:00.000Z",
    id: "saved-search-ru-review",
    requested_locale: "ru",
    locale: "ru",
    fallback_used: false,
    query: "Sandanski",
    filters: { property_type: "apartment", bedrooms_min: 2 },
    contact_ref: "saved-search-ru-review",
    contact_available: true,
    contact_preference: "email",
    alert_consent: true,
    match_count: 14,
    price_snapshot: {},
    alert_frequency: "daily",
    status: "active",
    alert_task: { id: "alert-ru-review", status: "open", owner: "broker_anna" },
  };
  const languageRequest = {
    requested_at: "2026-07-18T11:00:00.000Z",
    id: "language-request-he-review",
    requested_locale: "he",
    requested_path: "/he/properties/MS-CRAWL-0114",
    fallback_locale: "en",
    admin_locale: "en",
    public_indexable: false,
    notification_requested: true,
    contact_ref: "language-request-he-review",
    contact_available: true,
    message_available: true,
  };
  const paths = {
    auditLogPath: jsonl(directory, "audit"),
    brokerContactLedgerPath: jsonl(directory, "broker-contacts"),
    dealLedgerPath: jsonl(directory, "deals"),
    languageRequestPath: jsonl(directory, "language-requests", [languageRequest]),
    leadLedgerPath: jsonl(directory, "leads"),
    leadContactVaultPath: jsonl(directory, "lead-contacts"),
    publicContactVaultPath: jsonl(directory, "public-contacts"),
    publicRequestOutcomeLedgerPath: jsonl(directory, "public-request-outcomes"),
    replyOutboxPath: jsonl(directory, "replies"),
    listingEditLedgerPath: jsonl(directory, "listing-edits"),
    savedSearchLedgerPath: jsonl(directory, "saved-searches", [savedSearch]),
    sellerPipelinePath: jsonl(directory, "seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: jsonl(directory, "seller-pipeline-outcomes"),
    translationLedgerPath: jsonl(directory, "translations"),
    viewingLedgerPath: jsonl(directory, "viewings"),
    viewingFollowUpLedgerPath: jsonl(directory, "viewing-follow-ups"),
    viewingTripLedgerPath: jsonl(directory, "viewing-trip-requests"),
  };
  appendPublicContact(
    {
      subjectType: "saved_search",
      subjectId: savedSearch.id,
      contact: { name: "Elena Petrova", email: "elena@example.test" },
      contactPreference: "email",
    },
    { filePath: paths.publicContactVaultPath, secret: SECRET, storedAt: "2026-07-18T10:00:00.000Z" },
  );
  appendPublicContact(
    {
      subjectType: "language_request",
      subjectId: languageRequest.id,
      contact: { name: "Noa Levi", phone: "+359 888 111 222" },
      contactPreference: "phone",
      message: "Please tell me when this property is available in Hebrew.",
    },
    {
      filePath: paths.publicContactVaultPath,
      secret: SECRET,
      storedAt: "2026-07-18T11:00:00.000Z",
      includeMessage: true,
    },
  );
  return {
    config: {
      ...appAdminConfigFromEnv({}),
      ...paths,
      leadContactKey: SECRET,
      publicContactKey: SECRET,
      publicRequestOutcomeAt: "2026-07-19T09:00:00.000Z",
      reviewedAt: "2026-07-19T09:00:00.000Z",
    },
    paths,
    savedSearch,
    languageRequest,
  };
}

test("authenticated request workspace joins private contacts without leaking them into safe ledgers", async () => {
  const { config, paths } = fixture();
  await withCredentials(async () => {
    const unauthorized = await renderAppAdminResponse(new Request("http://local/api/admin/requests"), { config });
    assert.equal(unauthorized.status, 401);

    const response = await renderAppAdminResponse(
      new Request("http://local/api/admin/requests?locale=ru", { headers: AUTH }),
      { config },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.kind, "admin_requests");
    assert.equal(body.workspace.operator_id, "broker_anna");
    assert.equal(body.publicRequestQueue.summary.open, 2);
    assert.equal(body.publicRequestQueue.summary.contacts_available, 2);
    assert.equal(body.publicRequestQueue.rows.find((row) => row.request_type === "saved_search").contact.email, "elena@example.test");
    assert.equal(
      body.publicRequestQueue.rows.find((row) => row.request_type === "language_request").message,
      "Please tell me when this property is available in Hebrew.",
    );

    const htmlResponse = await renderAppAdminResponse(
      new Request("http://local/admin/requests?locale=ru", { headers: AUTH }),
      { config },
    );
    const html = await htmlResponse.text();
    assert.match(html, /Заявки и уведомления/);
    assert.match(html, /Ежедневно/);
    assert.doesNotMatch(html, />daily</);
    assert.match(html, /data-public-request-outcome-form="true"/);
    assert.match(html, /mailto:elena@example\.test/);
    assert.match(html, /data-private-request-message="true"/);

    assert.doesNotMatch(fs.readFileSync(paths.savedSearchLedgerPath, "utf8"), /elena@example\.test/);
    assert.doesNotMatch(fs.readFileSync(paths.languageRequestPath, "utf8"), /Noa Levi|Please tell me/);
  });
});

test("request outcomes bind the authenticated operator, update the queue, and append an audit row", async () => {
  const { config, paths, savedSearch } = fixture();
  await withCredentials(async () => {
    const spoofed = await renderAppAdminResponse(
      new Request("http://local/api/admin/public-requests/outcome", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ requestType: "saved_search", requestId: savedSearch.id, actor: "another_broker", action: "complete", note: "Done" }),
      }),
      { config },
    );
    assert.equal(spoofed.status, 400);

    const completed = await renderAppAdminResponse(
      new Request("http://local/api/admin/public-requests/outcome", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ requestType: "saved_search", requestId: savedSearch.id, action: "complete", note: "Customer asked us to stop alerts." }),
      }),
      { config },
    );
    assert.equal(completed.status, 201);
    const completedBody = await completed.json();
    assert.equal(completedBody.outcome.actor, "broker_anna");
    assert.equal(completedBody.request.status, "completed");

    const queueResponse = await renderAppAdminResponse(
      new Request("http://local/api/admin/requests", { headers: AUTH }),
      { config },
    );
    const queue = await queueResponse.json();
    assert.equal(queue.publicRequestQueue.summary.open, 1);
    assert.equal(queue.publicRequestQueue.summary.completed, 1);
    assert.equal(queue.publicRequestQueue.states.find((row) => row.request_id === savedSearch.id).status, "completed");

    const outcomes = readPublicRequestOutcomes(paths.publicRequestOutcomeLedgerPath);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].actor, "broker_anna");
    assert.doesNotMatch(fs.readFileSync(paths.publicRequestOutcomeLedgerPath, "utf8"), /elena@example\.test/);
    const audit = readAuditLog(paths.auditLogPath);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "public_request_outcome_recorded");
    assert.equal(audit[0].actor, "broker_anna");
    assert.equal(audit[0].metadata.status, "completed");
  });
});

test("Next admin request routes read and complete durable viewing-trip requests without file mirrors", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-requests-durable-"));
  const payload = payloadRuntime();
  const paths = {
    auditLogPath: jsonl(directory, "audit"),
    brokerContactLedgerPath: jsonl(directory, "broker-contacts"),
    dealLedgerPath: jsonl(directory, "deals"),
    languageRequestPath: jsonl(directory, "language-requests"),
    leadLedgerPath: jsonl(directory, "leads"),
    leadContactVaultPath: jsonl(directory, "lead-contacts"),
    publicRequestOutcomeLedgerPath: jsonl(directory, "public-request-outcomes"),
    replyOutboxPath: jsonl(directory, "replies"),
    listingEditLedgerPath: jsonl(directory, "listing-edits"),
    savedSearchLedgerPath: jsonl(directory, "saved-searches"),
    sellerPipelinePath: jsonl(directory, "seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: jsonl(directory, "seller-pipeline-outcomes"),
    translationLedgerPath: jsonl(directory, "translations"),
    viewingLedgerPath: jsonl(directory, "viewings"),
    viewingFollowUpLedgerPath: jsonl(directory, "viewing-follow-ups"),
    viewingTripLedgerPath: path.join(directory, "viewing-trip-requests.jsonl"),
    publicContactVaultPath: path.join(directory, "public-contacts.jsonl"),
  };
  const publicConfig = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "p".repeat(40),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
    MS_REALTY_PUBLIC_CONTACT_KEY: VIEWING_SECRET,
    MS_REALTY_WORKSPACE_ID: "ws-sandanski",
    MS_REALTY_CONSENT_LEDGER_PATH: path.join(directory, "consents.jsonl"),
    MS_REALTY_VIEWING_TRIP_REQUESTED_AT: "2026-08-29T09:00:00.000Z",
    MS_REALTY_RECEIVED_AT: "2026-08-29T09:00:00.000Z",
  });
  publicConfig.viewingDurablePayload = payload;
  const adminConfig = {
    ...appAdminConfigFromEnv({}),
    ...paths,
    auditLogPath: paths.auditLogPath,
    adminPrincipal: null,
    leadContactKey: VIEWING_SECRET,
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      contactSecret: VIEWING_SECRET,
      workspaceId: "ws-sandanski",
    },
    viewingDurablePayload: payload,
    publicRequestOutcomeAt: "2026-08-29T10:00:00.000Z",
    reviewedAt: "2026-08-29T10:00:00.000Z",
  };

  const created = await renderAppApiResponse(
    new Request("https://example.test/api/viewing-trips", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.test" },
      body: JSON.stringify({
        locale: "en",
        arrivalDate: "2026-10-05",
        departureDate: "2026-10-08",
        areas: ["Sandanski"],
        contact: { name: "Trip Visitor", phone: "+31612345678" },
        contact_preference: "phone",
        idempotencyKey: "admin-durable-viewing-trip",
      }),
    }),
    { config: publicConfig },
  );
  assert.equal(created.status, 201);
  assert.equal(fs.existsSync(paths.viewingTripLedgerPath), false);
  assert.equal(fs.existsSync(paths.publicContactVaultPath), false);

  await withCredentialRows([{ id: "admin_owner", token: TOKEN, roles: ["admin"], workspace_ids: ["ws-sandanski"] }], async () => {
    const response = await renderAppAdminResponse(
      new Request("http://local/api/admin/requests?locale=en", { headers: AUTH }),
      { config: adminConfig },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    const trip = body.publicRequestQueue.rows.find((row) => row.request_type === "viewing_trip");
    assert.ok(trip);
    assert.equal(trip.contact.phone, "+31612345678");
    assert.equal(body.publicRequestQueue.summary.viewing_trip_open, 1);

    const completed = await renderAppAdminResponse(
      new Request("http://local/api/admin/public-requests/outcome", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ requestType: "viewing_trip", requestId: trip.request_id, action: "contacted", note: "Called to confirm arrival." }),
      }),
      { config: adminConfig },
    );
    assert.equal(completed.status, 201);
    const completedBody = await completed.json();
    assert.equal(completedBody.request.request_type, "viewing_trip");
    assert.equal(completedBody.request.status, "contacted");
  });
});
