import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
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
