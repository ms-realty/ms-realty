import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { LeadIdempotencyConflictError } from "../lib/lead-durable-store.mjs";
import { approvedPublicSeedFixture, approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const CONTACT_SECRET = "test-only-durable-contact-key-32-characters-minimum";
const STORE_CONFIG = {
  leadDurableStoreEnabled: true,
  payloadSecret: "p".repeat(40),
  databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
  contactSecret: CONTACT_SECRET,
  workspaceId: "workspace-sandanski",
};

function leadInput() {
  return {
    source: "website_contact_callback",
    intent: "callback",
    leadType: "general",
    language: "he",
    contact: { name: "Storage Probe", phone: "+359000000000" },
    contact_preference: "phone",
    request_details: { callback_time: "Controlled test; do not call" },
    message: "Controlled durable-store test.",
    idempotencyKey: "durable-runtime-probe-1",
  };
}

function successfulStore(calls) {
  return async ({ lead, contactSecret, marketingOptIn, receivedAt, sellerPipelineCreatedAt, workspaceId }) => {
    calls.push({ lead, contactSecret, marketingOptIn, receivedAt, sellerPipelineCreatedAt, workspaceId });
    return {
      lead: { lead_id: lead.lead.id, idempotency_key: lead.lead.idempotency_key },
      contactVault: { lead_id: lead.lead.id, stored_at: receivedAt, encrypted: true, durable: true },
      consent: { consent_type: "inquiry_follow_up", subject_id: lead.lead.id },
      sellerPipeline: null,
      created: true,
      idempotent: false,
    };
  };
}

test("Next lead intake uses the durable store without touching lead files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-next-"));
  const calls = [];
  const config = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_LEAD_LEDGER_PATH: path.join(dir, "leads.jsonl"),
    MS_REALTY_LEAD_CONTACT_VAULT_PATH: path.join(dir, "contacts.jsonl"),
    MS_REALTY_CONSENT_LEDGER_PATH: path.join(dir, "consents.jsonl"),
    MS_REALTY_EVENT_LEDGER_PATH: path.join(dir, "events.jsonl"),
    MS_REALTY_SELLER_PIPELINE_PATH: path.join(dir, "seller-pipeline.jsonl"),
    MS_REALTY_RECEIVED_AT: "2026-08-10T09:00:00.000Z",
  });
  config.persistLeadIntakeDurably = successfulStore(calls);

  const response = await renderAppApiResponse(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.test" },
      body: JSON.stringify(leadInput()),
    }),
    { config },
  );
  const body = await response.json();

  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lead.lead.idempotency_key, "durable-runtime-probe-1");
  assert.equal(calls[0].contactSecret, CONTACT_SECRET);
  assert.equal(calls[0].workspaceId, STORE_CONFIG.workspaceId);
  assert.equal(body.contactVault.durable, true);
  assert.equal(body.ledger.idempotency_key, "durable-runtime-probe-1");
  assert.equal(fs.existsSync(config.leadLedgerPath), false);
  assert.equal(fs.existsSync(config.leadContactVaultPath), false);
  assert.equal(fs.existsSync(config.consentLedgerPath), false);
  assert.equal(fs.existsSync(config.eventLedgerPath), true);
  assert.equal(fs.existsSync(config.sellerPipelinePath), false);
});

test("requested durable storage fails closed when its runtime is incomplete", async () => {
  for (const override of [{ DATABASE_URL: "" }, { MS_REALTY_LEAD_CONTACT_KEY: "short" }, { MS_REALTY_WORKSPACE_ID: "" }]) {
    const config = appApiConfigFromEnv({
      ...approvedPublicSeedFixtureEnv(),
      MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
      PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
      DATABASE_URL: STORE_CONFIG.databaseUrl,
      MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
      MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
      ...override,
    });
    config.persistLeadIntakeDurably = async () => {
      throw new Error("must not be called");
    };

    const response = await renderAppApiResponse(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://example.test" },
        body: JSON.stringify(leadInput()),
      }),
      { config },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      kind: "lead_store_unavailable",
      // Nothing was persisted, so the receipt says so instead of "unknown".
      intake_status: "rejected",
      message: "Lead storage is temporarily unavailable",
    });
  }
});

test("Next lead intake requires an exact same-origin browser Origin", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-next-origin-"));
  const calls = [];
  const config = appApiConfigFromEnv({
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: STORE_CONFIG.payloadSecret,
    DATABASE_URL: STORE_CONFIG.databaseUrl,
    MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId,
    MS_REALTY_CONSENT_LEDGER_PATH: path.join(dir, "consents.jsonl"),
    MS_REALTY_EVENT_LEDGER_PATH: path.join(dir, "events.jsonl"),
  });
  config.persistLeadIntakeDurably = successfulStore(calls);

  for (const [origin, reason] of [
    [null, "missing_origin"],
    ["https://attacker.example", "cross_origin_request"],
  ]) {
    const headers = { "content-type": "application/json" };
    if (origin) headers.origin = origin;
    const response = await renderAppApiResponse(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers,
        body: JSON.stringify(leadInput()),
      }),
      { config },
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { kind: "cross_origin_write_blocked", reason });
  }
  assert.equal(calls.length, 0);

  const allowed = await renderAppApiResponse(
    new Request("http://container.internal/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "example.test",
        origin: "https://example.test",
        "sec-fetch-site": "same-origin",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify(leadInput()),
    }),
    { config },
  );

  assert.equal(allowed.status, 201, await allowed.text());
  assert.equal(calls.length, 1);
});

test("the standalone HTTP runtime uses the same durable lead path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-http-"));
  const calls = [];
  const response = await dispatchHttp(
    createHttpApp({
      seed: approvedPublicSeedFixture(),
      leadDurableStore: STORE_CONFIG,
      persistLeadIntake: successfulStore(calls),
      leadContactKey: CONTACT_SECRET,
      consentLedgerPath: path.join(dir, "consents.jsonl"),
      eventLedgerPath: path.join(dir, "events.jsonl"),
      receivedAt: "2026-08-10T09:00:00.000Z",
    }),
    { method: "POST", url: "/api/leads", headers: { host: "localhost", origin: "http://localhost" }, body: leadInput() },
  );

  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lead.lead.idempotency_key, "durable-runtime-probe-1");
  assert.equal(response.body.contactVault.durable, true);
});

test("standalone admin lead reads pass an authenticated workspace scope to the durable reader", async () => {
  const calls = [];
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    leadDurableStore: STORE_CONFIG,
    readLeadIntakes: async (input) => {
      calls.push(input);
      return [];
    },
  });
  const response = await dispatchHttp(app, {
    method: "GET",
    url: "/api/admin/leads",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].admin, true);
  assert.deepEqual(calls[0].workspaceIds, ["workspace-sandanski"]);
  assert.equal(calls[0].user.role, "admin");
  assert.deepEqual(response.body.leads, []);
});

test("standalone lead intake requires an exact same-origin browser Origin", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-http-origin-"));
  const calls = [];
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    leadDurableStore: STORE_CONFIG,
    persistLeadIntake: successfulStore(calls),
    leadContactKey: CONTACT_SECRET,
    consentLedgerPath: path.join(dir, "consents.jsonl"),
    eventLedgerPath: path.join(dir, "events.jsonl"),
  });

  for (const [headers, reason] of [
    [{}, "missing_origin"],
    [{ origin: "https://attacker.example" }, "cross_origin_request"],
  ]) {
    const response = await dispatchHttp(app, { method: "POST", url: "/api/leads", headers, body: leadInput() });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { kind: "cross_origin_write_blocked", reason });
  }
  const allowed = await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
    },
    body: leadInput(),
  });
  assert.equal(allowed.status, 201);
  assert.equal(calls.length, 1);
});

// Same contract on the Next runtime without the durable store: a retry with
// the same idempotency key replays the original lead, completes a consent
// record a crash skipped, and a reused key with a different payload is
// refused. (Reinitialization = a new config in this process.)
test("Next lead intake replays a retried enquiry and refuses a reused key on the ledger runtime", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-next-lead-retry-"));
  fs.writeFileSync(path.join(dir, "not-a-dir"), "");
  const env = (overrides = {}) => ({
    NODE_ENV: "test",
    ...approvedPublicSeedFixtureEnv(),
    MS_REALTY_LEAD_CONTACT_KEY: "test-only-lead-contact-key-32-characters-minimum",
    MS_REALTY_LEAD_LEDGER_PATH: path.join(dir, "leads.jsonl"),
    MS_REALTY_LEAD_CONTACT_VAULT_PATH: path.join(dir, "contacts.jsonl"),
    MS_REALTY_CONSENT_LEDGER_PATH: path.join(dir, "consents.jsonl"),
    MS_REALTY_EVENT_LEDGER_PATH: path.join(dir, "events.jsonl"),
    MS_REALTY_SELLER_PIPELINE_PATH: path.join(dir, "seller-pipeline.jsonl"),
    ...overrides,
  });
  const body = { idempotencyKey: "public-lead:22222222-2222-4222-8222-222222222222", source: "website_listing_detail", leadType: "buyer", language: "bg", listingReference: "MS-00815", contact: { name: "Retry Person", phone: "+359880000123" }, contact_preference: "phone", message: "Retry" };
  const post = (config, payload) => renderAppApiResponse(new Request("https://example.test/api/leads", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(payload) }), { config });
  const { readLeadLedger } = await import("../lib/lead-ledger.mjs");

  const consentFailure = await post(appApiConfigFromEnv(env({ MS_REALTY_CONSENT_LEDGER_PATH: path.join(dir, "not-a-dir", "consents.jsonl") })), body);
  assert.ok(consentFailure.status >= 400);
  assert.equal(readLeadLedger(path.join(dir, "leads.jsonl")).length, 1, "ledger row written before consent failed");

  const config = appApiConfigFromEnv(env());
  const retry = await post(config, body);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.lead.id, readLeadLedger(path.join(dir, "leads.jsonl"))[0].lead_id);
  assert.ok(retryBody.consent, "missing consent recorded on replay");
  const again = await post(config, body);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).consent, null);
  assert.equal(fs.readFileSync(path.join(dir, "consents.jsonl"), "utf8").trim().split("\n").length, 1);

  const conflict = await post(config, { ...body, message: "Changed" });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).kind, "idempotency_conflict");
  assert.equal(readLeadLedger(path.join(dir, "leads.jsonl")).length, 1);
});

// On the durable store a replay answers with the original identity and a
// reused key with a different payload is a 409, on both runtimes.
test("durable replay keeps the original identity and a reused key is refused on both runtimes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-replay-"));
  const replayStore = async ({ lead }) => ({
    lead: { lead_id: "lead-draft-original-0001", idempotency_key: lead.lead.idempotency_key, source: lead.lead.source, listing_reference: lead.lead.listingReference || null },
    contactVault: { lead_id: "lead-draft-original-0001", stored_at: "2026-08-10T09:00:00.000Z", encrypted: true, durable: true },
    consent: { consent_type: "inquiry_follow_up", subject_id: "lead-draft-original-0001" },
    sellerPipeline: null,
    created: false,
    idempotent: true,
  });
  const conflictStore = async () => { throw new LeadIdempotencyConflictError(); };
  const input = leadInput();

  const nextConfig = (store) => {
    const config = appApiConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv(), MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true", PAYLOAD_SECRET: STORE_CONFIG.payloadSecret, DATABASE_URL: STORE_CONFIG.databaseUrl, MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET, MS_REALTY_WORKSPACE_ID: STORE_CONFIG.workspaceId, MS_REALTY_CONSENT_LEDGER_PATH: path.join(dir, "consents.jsonl"), MS_REALTY_EVENT_LEDGER_PATH: path.join(dir, "events.jsonl") });
    config.persistLeadIntakeDurably = store;
    return config;
  };
  const nextReplay = await renderAppApiResponse(new Request("https://example.test/api/leads", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(input) }), { config: nextConfig(replayStore) });
  const nextReplayBody = await nextReplay.json();
  assert.equal(nextReplay.status, 200);
  assert.equal(nextReplayBody.lead.id, "lead-draft-original-0001");
  assert.equal(nextReplayBody.id, "inbox-lead-draft-original-0001");
  assert.equal(nextReplayBody.receipt.lead_id, "lead-draft-original-0001");
  const nextConflict = await renderAppApiResponse(new Request("https://example.test/api/leads", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test" }, body: JSON.stringify(input) }), { config: nextConfig(conflictStore) });
  assert.equal(nextConflict.status, 409);
  assert.deepEqual(await nextConflict.json().then((body) => [body.kind, body.intake_status]), ["idempotency_conflict", "rejected"]);

  const nodeApp = (store) => createHttpApp({ seed: approvedPublicSeedFixture(), leadDurableStore: STORE_CONFIG, persistLeadIntake: store, leadContactKey: CONTACT_SECRET, consentLedgerPath: path.join(dir, "consents.jsonl"), eventLedgerPath: path.join(dir, "events.jsonl") });
  const nodeReplay = await dispatchHttp(nodeApp(replayStore), { method: "POST", url: "/api/leads", headers: { host: "localhost", origin: "http://localhost" }, body: input });
  assert.equal(nodeReplay.status, 200);
  assert.equal(nodeReplay.body.lead.id, "lead-draft-original-0001");
  assert.equal(nodeReplay.body.id, "inbox-lead-draft-original-0001");
  const nodeConflict = await dispatchHttp(nodeApp(conflictStore), { method: "POST", url: "/api/leads", headers: { host: "localhost", origin: "http://localhost" }, body: input });
  assert.equal(nodeConflict.status, 409);
  assert.deepEqual([nodeConflict.body.kind, nodeConflict.body.intake_status], ["idempotency_conflict", "rejected"]);
});
