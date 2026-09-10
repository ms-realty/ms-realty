import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";

const WORKSPACE = "consent-workspace";
const ROLES = ["admin", "broker", "editor", "translator", "agent"];
const credentials = [
  ...ROLES.map((role) => ({ id: `consent_${role}`, token: `consent-${role}-test-token-0123456789`, roles: [role], workspace_ids: [WORKSPACE] })),
  { id: "foreign_broker", token: "consent-foreign-test-token-0123456789", roles: ["broker"], workspace_ids: ["other-workspace"] },
];
const AUTH_ENV = { NODE_ENV: "production", MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify(credentials) };
const ENV = {
  ...AUTH_ENV,
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-consent-payload-secret-0123456789",
  DATABASE_URL: "postgres://test:test@consent.example.invalid/test",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-consent-contact-key-0123456789",
  MS_REALTY_WORKSPACE_ID: WORKSPACE,
};
const previous = {};
before(() => {
  for (const key of [...Object.keys(AUTH_ENV), "MS_REALTY_ADMIN_TOKEN", "MS_REALTY_ADMIN_ACTOR"]) previous[key] = process.env[key];
  Object.assign(process.env, AUTH_ENV);
  delete process.env.MS_REALTY_ADMIN_TOKEN;
  delete process.env.MS_REALTY_ADMIN_ACTOR;
});
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function grant(subject, workspace = WORKSPACE) {
  const row = { recorded_at: "2026-09-10T09:00:00.000Z", consent_type: "inquiry_follow_up", source: "website_listing_detail", subject_id: subject, locale: "bg", granted: true, legal_basis: "legitimate_interest", marketing_opt_in: false, contact_fingerprint: "privacy-safe-test-fingerprint" };
  return { id: subject, workspace_id: workspace, lead_id: subject, event_id: `grant:${workspace}:${subject}`, recorded_at: row.recorded_at, payload: row };
}

// Exercise the real durable reader/writer through both adapters. Only Payload's
// I/O is in memory; scope checks, state derivation and attribution are real code.
function harness(t, adapter, durableOnly = true, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-consent-authority-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const consentLedgerPath = path.join(directory, "consents.jsonl");
  const stale = JSON.stringify(grant("disk-only-stale-consent").payload) + "\n";
  fs.writeFileSync(consentLedgerPath, stale);
  const state = { docs: [grant("durable-consent"), grant("foreign-consent", "other-workspace")], queries: [], writes: [], readFailure: false, writeFailure: false, leakOtherWorkspace: false };
  const matches = (doc, where = {}) => Object.entries(where).every(([key, value]) => key === "and" ? value.every((clause) => matches(doc, clause)) : doc[key] === value.equals);
  const payload = {
    db: { beginTransaction: async () => "test", commitTransaction: async () => {}, rollbackTransaction: async () => {} },
    async find(query) {
      assert.equal(query.collection, "consent_events");
      state.queries.push(query);
      if (state.readFailure) throw new Error("test storage outage");
      return { docs: state.leakOtherWorkspace ? [state.docs[1]] : state.docs.filter((doc) => matches(doc, query.where)) };
    },
    async create({ collection, data }) {
      assert.equal(collection, "consent_events");
      if (state.writeFailure) throw new Error("test storage write outage");
      const stored = { id: state.docs.length + 1, ...data };
      state.docs.push(stored); state.writes.push(stored); return stored;
    },
  };
  const config = { ...appAdminConfigFromEnv(ENV), authEnv: AUTH_ENV, runtimeDataDurableOnly: durableOnly, leadDurablePayload: payload, consentLedgerPath, auditLogPath: path.join(directory, "audit.jsonl"), reviewedAt: "2026-09-10T10:00:00.000Z", ...overrides };
  const request = async (url, { role = "admin", method = "GET", body } = {}) => {
    const credential = credentials.find((entry) => entry.id === (role === "foreign" ? "foreign_broker" : `consent_${role}`));
    const headers = { authorization: `Bearer ${credential.token}`, ...(body ? { "content-type": "application/json" } : {}) };
    if (adapter === "standalone") return dispatchHttp(createHttpApp(config), { url, method, headers, body });
    const response = await renderAppAdminResponse(new Request(`https://consent.example.test${url}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), { config });
    return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text() };
  };
  return { request, state, config, assertDiskUnchanged: () => assert.equal(fs.readFileSync(consentLedgerPath, "utf8"), stale) };
}

const withdrawal = { consentType: "inquiry_follow_up", subjectId: "durable-consent", reasonCode: "customer_request", humanConfirmed: true };
for (const adapter of ["next", "standalone"]) {
  for (const durableOnly of [false, true]) test(`${adapter}: consent page follows durable withdrawal across reloads with durableOnly=${durableOnly}`, async (t) => {
    const h = harness(t, adapter, durableOnly);
    const read = await h.request("/api/admin/consents?locale=bg");
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.consentStates.map((row) => row.subject_id), ["durable-consent"]);
    assert.equal(read.body.summary.granted, 1);
    const wrote = await h.request("/api/admin/consents/withdraw", { role: "broker", method: "POST", body: withdrawal });
    assert.equal(wrote.status, 201);
    assert.equal(wrote.body.record.actor, "consent_broker");
    assert.equal(h.state.docs[0].payload.granted, true, "the grant remains immutable");
    for (const locale of ["bg", "ru", "en"]) {
      const data = await h.request(`/api/admin/consents?locale=${locale}`, { role: "broker" });
      assert.equal(data.status, 200); assert.equal(data.body.locale, locale);
      assert.equal(data.body.summary.withdrawn, 1); assert.equal(data.body.summary.granted, 0);
      assert.equal(data.body.consentStates[0].withdrawable, false);
      const page = await h.request(`/admin/consents?locale=${locale}`, { role: "broker" });
      assert.equal(page.status, 200); assert.match(page.body, /durable-consent/);
      assert.doesNotMatch(page.body, /disk-only-stale-consent|foreign-consent|data-consent-withdrawal-control/);
    }
    const retry = await h.request("/api/admin/consents/withdraw", { role: "broker", method: "POST", body: withdrawal });
    assert.equal(retry.status, 200); assert.equal(retry.body.idempotent, true);
    assert.equal(h.state.writes.length, 1); h.assertDiskUnchanged();
    // The standalone Payload-only runtime deliberately suppresses file audit
    // writes. Its immutable consent event still contains the authenticated actor.
    if (adapter === "next" || !durableOnly) {
      assert.deepEqual(readAuditLog(h.config.auditLogPath).map((row) => row.action), ["consent_withdrawn"]);
    }
  });

  test(`${adapter}: consent roles and configured workspace are enforced before storage access`, async (t) => {
    const h = harness(t, adapter, false);
    for (const role of ["editor", "translator", "agent", "foreign"]) for (const url of ["/admin/consents", "/api/admin/consents", "/api/admin/consents/withdraw"]) {
      const response = await h.request(url, { role, ...(url.endsWith("withdraw") ? { method: "POST", body: withdrawal } : {}) });
      assert.equal(response.status, 403, `${role} ${url}`);
    }
    assert.equal(h.state.queries.length, 0); assert.equal(h.state.writes.length, 0); h.assertDiskUnchanged();
    for (const role of ["admin", "broker"]) assert.equal((await h.request("/api/admin/consents", { role })).status, 200);
    assert.ok(h.state.queries.every((query) => query.where.workspace_id.equals === WORKSPACE));
  });

  test(`${adapter}: durable consent read failures and wrong-workspace rows never fall back to disk`, async (t) => {
    const h = harness(t, adapter, false);
    for (const failure of ["readFailure", "leakOtherWorkspace"]) {
      h.state[failure] = true;
      for (const url of ["/admin/consents?locale=ru", "/api/admin/consents"]) {
        const response = await h.request(url);
        assert.equal(response.status, 503, `${failure} ${url}`);
        assert.doesNotMatch(JSON.stringify(response.body), /disk-only-stale-consent|foreign-consent/);
      }
      h.state[failure] = false;
    }
    h.assertDiskUnchanged();
  });

  test(`${adapter}: withdrawal preserves confirmation, attribution and durable failure boundaries`, async (t) => {
    const h = harness(t, adapter);
    for (const patch of [{ humanConfirmed: false }, { actor: "someone_else" }, { subjectId: "foreign-consent" }]) {
      assert.equal((await h.request("/api/admin/consents/withdraw", { method: "POST", body: { ...withdrawal, ...patch } })).status, 400);
    }
    h.state.writeFailure = true;
    const failed = await h.request("/api/admin/consents/withdraw", { method: "POST", body: withdrawal });
    assert.equal(failed.status, 503); assert.equal(failed.body.kind, "lead_store_unavailable");
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.docs[0].payload.granted, true); h.assertDiskUnchanged();
  });

  test(`${adapter}: disabled or incomplete durable authority cannot select the stale file ledger`, async (t) => {
    for (const overrides of [
      { leadOperationsDurableStore: { leadOperationsDurableStoreEnabled: false } },
      { leadDurableStore: { leadDurableStoreEnabled: true, workspaceId: WORKSPACE } },
      { leadDurableStore: { leadDurableStoreEnabled: false }, runtimeDataDurableOnly: true },
    ]) {
      const h = harness(t, adapter, false, overrides);
      assert.equal((await h.request("/api/admin/consents")).status, 503);
      assert.equal((await h.request("/api/admin/consents/withdraw", { method: "POST", body: withdrawal })).status, 503);
      assert.equal(h.state.queries.length, 0); assert.equal(h.state.writes.length, 0); h.assertDiskUnchanged();
    }
  });
}
