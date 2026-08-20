import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  createPayloadAdminAuthService,
  payloadAdminPrincipal,
} from "../lib/payload-admin-auth.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const BASE_URL = "https://ms-realty.ms-realty-bg.workers.dev";
const NOW_SECONDS = 1_786_377_600;

function user(overrides = {}) {
  return {
    id: 1,
    collection: "admins",
    email: "peycheff.com@gmail.com",
    name: "MS Realty Admin",
    role: "admin",
    workspace_ids: ["sandanski"],
    ...overrides,
  };
}

function fakePayload() {
  const calls = [];
  const admin = user();
  return {
    calls,
    collections: { admins: { config: { slug: "admins" } } },
    async login(options) {
      calls.push(["login", options]);
      if (options.data.email !== admin.email || options.data.password !== "correct-password") {
        throw new Error("Authentication failed for a secret reason");
      }
      return { token: "payload.jwt.session", exp: NOW_SECONDS + 3600, user: admin };
    },
    async auth({ headers }) {
      const token = headers.get("authorization");
      calls.push(["auth", token]);
      if (token !== "JWT payload.jwt.session") return { user: null };
      return { user: { ...admin, _sid: "session-1" } };
    },
    async find(options) {
      calls.push(["find", options]);
      return { docs: [admin], totalDocs: 1 };
    },
    async create(options) {
      calls.push(["create", options]);
      return user({ id: 2, ...options.data });
    },
  };
}

function adapterConfig(payloadAdminAuth, authEnv = {}) {
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    authEnv: { NODE_ENV: "production", ...authEnv },
    payloadAdminAuth,
    nowSeconds: () => NOW_SECONDS,
  };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

test("Payload identity maps to the custom principal without exposing auth secrets", () => {
  assert.deepEqual(payloadAdminPrincipal(user()), {
    id: "payload-1",
    source: "payload_session",
    can_mutate: true,
    roles: ["admin"],
    workspace_ids: ["sandanski"],
    payload_user_id: 1,
    email: "peycheff.com@gmail.com",
  });
  assert.equal(payloadAdminPrincipal(user({ collection: "customers" })), null);
  assert.equal(payloadAdminPrincipal(user({ role: "unknown" })), null);
});

test("Payload Local API backs login, validation, revocation, and access-controlled team writes", async () => {
  const payload = fakePayload();
  const revoked = [];
  const service = createPayloadAdminAuthService(payload, {
    revokePayloadSession: async (args) => revoked.push(args),
  });

  const login = await service.login({ email: " peycheff.com@gmail.com ", password: "correct-password" });
  assert.equal(login.token, "payload.jwt.session");
  assert.equal(login.exp, NOW_SECONDS + 3600);
  assert.equal(login.principal.id, "payload-1");
  assert.equal(payload.calls[0][1].collection, "admins");

  const session = await service.resolve("payload.jwt.session");
  assert.equal(session.principal.email, "peycheff.com@gmail.com");
  assert.equal(await service.resolve("tampered"), null);

  const team = await service.listOperators(session);
  assert.equal(team[0].email, "peycheff.com@gmail.com");
  const listOptions = payload.calls.find(([name]) => name === "find")[1];
  assert.equal(listOptions.limit, 0);
  assert.equal(listOptions.pagination, false);
  const created = await service.createOperator(session, {
    email: "broker@example.com",
    password: "a-long-unique-password",
    name: "Broker",
    role: "broker",
    workspace_ids: ["sandanski"],
  });
  assert.equal(created.email, "broker@example.com");
  for (const operation of ["find", "create"]) {
    const options = payload.calls.find(([name]) => name === operation)[1];
    assert.equal(options.collection, "admins");
    assert.equal(options.overrideAccess, false);
    assert.equal(options.user.id, 1);
  }

  assert.equal(await service.logout("payload.jwt.session"), true);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].user.id, 1);
  assert.equal(await service.logout("tampered"), false);
});

test("custom login uses email/password and issues only a short-lived Payload session cookie", async () => {
  const service = createPayloadAdminAuthService(fakePayload(), {
    revokePayloadSession: async () => true,
  });
  const config = adapterConfig(service);

  const form = await renderAppAdminResponse(new Request(`${BASE_URL}/admin/login`), { config });
  const html = await form.text();
  assert.equal(form.status, 200);
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.doesNotMatch(html, /name="token"|Операторски ключ/);
  assert.doesNotMatch(html, /forgot|reset-password/i);

  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "peycheff.com@gmail.com", password: "correct-password" }),
    }),
    { config },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/admin");
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /^ms_admin=payload\.jwt\.session;/);
  assert.match(setCookie, /Max-Age=3600/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /correct-password|login-operator-token/);
});

test("wrong password, tampered cookie, and expired session fail generically", async () => {
  const service = createPayloadAdminAuthService(fakePayload(), {
    revokePayloadSession: async () => true,
  });
  const config = adapterConfig(service);
  const badLogin = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "peycheff.com@gmail.com", password: "wrong" }),
    }),
    { config },
  );
  assert.equal(badLogin.status, 303);
  assert.equal(badLogin.headers.get("location"), "/admin/login?error=1");
  assert.equal(badLogin.headers.get("set-cookie"), null);

  for (const token of ["tampered", "expired"] ) {
    const response = await renderAppAdminResponse(
      new Request(`${BASE_URL}/api/admin/team`, { headers: { cookie: `ms_admin=${token}` } }),
      { config },
    );
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /Authentication failed|password|token/i);
  }
});

test("team registration is admin-only and executes through Payload access", async () => {
  const created = [];
  const baseSession = { user: user(), principal: payloadAdminPrincipal(user()) };
  const service = {
    async resolve(token) {
      if (token === "admin-session") return baseSession;
      if (token === "broker-session") {
        const broker = user({ id: 3, email: "broker@ms.test", role: "broker" });
        return { user: broker, principal: payloadAdminPrincipal(broker) };
      }
      return null;
    },
    async listOperators() {
      return [user()];
    },
    async createOperator(_session, input) {
      created.push(input);
      return user({ id: 4, ...input });
    },
  };

  const input = {
    email: "new-broker@example.com",
    password: "a-long-unique-password",
    name: "New Broker",
    role: "broker",
    workspace_ids: ["sandanski"],
  };
  const broker = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, {
      method: "POST",
      headers: { cookie: "ms_admin=broker-session", "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    { config: adapterConfig(service) },
  );
  assert.equal(broker.status, 403);
  assert.equal((await broker.json()).required_capability, "team:manage");
  assert.equal(created.length, 0);

  const admin = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, {
      method: "POST",
      headers: { cookie: "ms_admin=admin-session", "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    { config: adapterConfig(service) },
  );
  assert.equal(admin.status, 201);
  assert.equal((await admin.json()).operator.email, input.email);
  assert.equal(created.length, 1);
});

test("both custom-admin routes reject operator passwords shorter than 12 characters", async () => {
  const payload = fakePayload();
  const service = createPayloadAdminAuthService(payload, {
    revokePayloadSession: async () => true,
  });
  const body = {
    email: "short-password@example.com",
    password: "too-short",
    name: "Short Password",
    role: "broker",
    workspace_ids: ["sandanski"],
  };

  const appResponse = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, {
      method: "POST",
      headers: {
        cookie: "ms_admin=payload.jwt.session",
        "content-type": "application/json",
        host: "ms-realty.ms-realty-bg.workers.dev",
        origin: BASE_URL,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(body),
    }),
    { config: adapterConfig(service) },
  );
  assert.equal(appResponse.status, 400);
  assert.match((await appResponse.json()).message, /at least 12 characters/);

  const httpResponse = await dispatchHttp(
    createHttpApp({ payloadAdminAuth: service, nowSeconds: () => NOW_SECONDS }),
    {
      method: "POST",
      url: "/api/admin/team",
      headers: {
        cookie: "ms_admin=payload.jwt.session",
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
      },
      body,
    },
  );
  assert.equal(httpResponse.status, 400);
  assert.match(httpResponse.body.message, /at least 12 characters/);
  assert.equal(payload.calls.some(([name]) => name === "create"), false);
});

test("Payload-session brokers cannot cross the configured custom-admin workspace", async () => {
  const broker = user({ id: 3, email: "broker@ms.test", role: "broker", workspace_ids: ["melnik"] });
  const service = {
    async resolve() {
      return { user: broker, principal: payloadAdminPrincipal(broker) };
    },
  };
  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/cases`, { headers: { cookie: "ms_admin=broker-session" } }),
    { config: { ...adapterConfig(service), realtyCaseWorkspaceId: "sandanski" } },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).required_capability, "workspace:access");
});

test("browser session mutations still require same-origin CSRF evidence", async () => {
  let creates = 0;
  const admin = user();
  const service = {
    async resolve() {
      return { user: admin, principal: payloadAdminPrincipal(admin) };
    },
    async createOperator(_session, input) {
      creates += 1;
      return user({ id: 5, ...input });
    },
  };
  const body = JSON.stringify({
    email: "csrf-safe@example.com",
    password: "a-long-unique-password",
    role: "broker",
    workspace_ids: ["sandanski"],
  });
  const crossSite = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, {
      method: "POST",
      headers: {
        cookie: "ms_admin=admin-session",
        "content-type": "application/json",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      body,
    }),
    { config: adapterConfig(service) },
  );
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).kind, "cross_origin_write_blocked");
  assert.equal(creates, 0);

  const sameOrigin = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, {
      method: "POST",
      headers: {
        cookie: "ms_admin=admin-session",
        "content-type": "application/json",
        host: "ms-realty.ms-realty-bg.workers.dev",
        origin: BASE_URL,
        "sec-fetch-site": "same-origin",
      },
      body,
    }),
    { config: adapterConfig(service) },
  );
  assert.equal(sameOrigin.status, 201);
  assert.equal(creates, 1);
});

test("Payload browser sessions see provider connections without becoming MCP bearer credentials", async () => {
  const sessionService = {
    async resolve() {
      const admin = user();
      return { user: admin, principal: payloadAdminPrincipal(admin) };
    },
  };
  const sessionResponse = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/connect`, { headers: { cookie: "ms_admin=payload.jwt.session" } }),
    { config: adapterConfig(sessionService) },
  );
  assert.equal(sessionResponse.status, 200);
  const sessionBody = await sessionResponse.text();
  assert.match(sessionBody, /Подключения MS Realty/);
  assert.doesNotMatch(sessionBody, /payload\.jwt\.session/);

  const token = "named-mcp-operator-token-0123456789";
  const bearerResponse = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/connect`, { headers: { authorization: `Bearer ${token}` } }),
    {
      config: adapterConfig(null, {
        MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([{ id: "mcp_operator", token, roles: ["admin"] }]),
        MS_REALTY_PUBLIC_ORIGIN: BASE_URL,
      }),
    },
  );
  assert.equal(bearerResponse.status, 200);
  assert.match(await bearerResponse.text(), new RegExp(token));
});

test("Payload admin can approve and send a durable lead reply without the file outbox", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-provider-reply-"));
  const auditLogPath = path.join(directory, "audit.jsonl");
  const captured = [];
  const sessionService = {
    async resolve() {
      const admin = user();
      return { user: admin, principal: payloadAdminPrincipal(admin) };
    },
  };
  const config = {
    ...adapterConfig(sessionService),
    auditLogPath,
    payloadListingRuntime: createPayloadDraftRuntime(loadCmsSeed()).payload,
    runtimeDataDurableOnly: true,
    leadDurableStore: {
      leadDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
      workspaceId: "workspace-sandanski",
    },
    readLeadIntakesDurably: async () => [
      {
        lead_id: "lead-durable-1",
        original_language: "bg",
        admin_locale: "bg",
        listing_reference: "MS-42",
        contact: { phone: "+359888123456" },
      },
    ],
    deliverApprovedProviderMessage: async (input) => {
      captured.push(input);
      return {
        idempotency_key: input.idempotencyKey,
        lead_id: input.leadId,
        provider: input.provider,
        status: "sent",
        external_message_id: "wamid.test-1",
        started_at: "2026-08-13T12:00:00.000Z",
        completed_at: "2026-08-13T12:00:01.000Z",
        idempotent: false,
      };
    },
    providerConnection: {
      credentialSecret: "provider-secret-longer-than-thirty-two-characters",
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
    },
    readProviderConnections: async () => [{ provider: "whatsapp", status: "connected", account_label: "MS Realty" }],
  };
  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/replies/delivery`, {
      method: "POST",
      headers: {
        cookie: "ms_admin=payload.jwt.session",
        "content-type": "application/json",
        host: "ms-realty.ms-realty-bg.workers.dev",
        origin: BASE_URL,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        leadId: "lead-durable-1",
        provider: "whatsapp",
        reviewedReply: "Одобренный ответ покупателю",
        approved: "true",
        idempotencyKey: "provider:00000000-0000-4000-8000-000000000001",
        actor: "spoofed-operator",
      }),
    }),
    { config },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.delivery.status, "sent");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].approvedBy, "payload-1");
  assert.equal(captured[0].leadId, "lead-durable-1");
  assert.equal(captured[0].recipient, "+359888123456");
  const audit = fs.readFileSync(auditLogPath, "utf8");
  assert.doesNotMatch(audit, /359888123456|Одобренный ответ покупателю|spoofed-operator/);
  assert.match(audit, /provider_reply_sent/);

  const page = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/leads`, { headers: { cookie: "ms_admin=payload.jwt.session" } }),
    { config },
  );
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /data-direct-provider-reply="true"/);
  assert.match(html, /action="\/api\/admin\/replies\/delivery"/);
  assert.match(html, /name="idempotencyKey" value="provider:[0-9a-f-]+"/);
  assert.match(html, /<option value="whatsapp">WhatsApp<\/option>/);
  assert.match(html, /name="reviewedReply"/);
});

test("Payload admin books a durable viewing and persists the Google Calendar receipt", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-viewing-"));
  const sessionService = {
    async resolve() {
      const admin = user();
      return { user: admin, principal: payloadAdminPrincipal(admin) };
    },
  };
  const rows = [];
  const calendarReceipts = [];
  const config = {
    ...adapterConfig(sessionService),
    auditLogPath: path.join(directory, "audit.jsonl"),
    bookedAt: "2026-08-13T12:00:00.000Z",
    payloadListingRuntime: createPayloadDraftRuntime(loadCmsSeed()).payload,
    runtimeDataDurableOnly: true,
    leadDurableStore: {
      leadDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
      workspaceId: "workspace-sandanski",
    },
    readLeadIntakesDurably: async () => [
      {
        lead_id: "lead-durable-viewing",
        lead_type: "seller",
        received_at: "2026-08-13T10:00:00.000Z",
        original_language: "bg",
        admin_locale: "bg",
        listing_reference: "MS-99",
      },
    ],
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
    },
    readViewingsDurably: async () => rows,
    persistViewingDurably: async (viewing) => {
      rows.push(viewing);
      return { ...viewing, durable: true };
    },
    syncViewingToGoogleCalendar: async () => ({
      status: "synced",
      provider: "google",
      calendar_event_id: "msr-calendar-viewing",
    }),
    recordViewingCalendarSync: async (viewingId, result) => {
      calendarReceipts.push({ viewingId, ...result });
      return { ...result, recorded_at: "2026-08-13T12:00:00.000Z" };
    },
  };
  const request = () =>
    new Request(`${BASE_URL}/api/admin/viewings`, {
      method: "POST",
      headers: {
        cookie: "ms_admin=payload.jwt.session",
        "content-type": "application/json",
        host: "ms-realty.ms-realty-bg.workers.dev",
        origin: BASE_URL,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        leadId: "lead-durable-viewing",
        broker: "payload-1",
        startsAt: "2026-08-20T10:00:00.000Z",
      }),
    });

  const response = await renderAppAdminResponse(request(), { config });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.durable, true);
  assert.equal(body.calendar_sync.calendar_event_id, "msr-calendar-viewing");
  assert.equal(rows.length, 1);
  assert.deepEqual(calendarReceipts, [
    { viewingId: body.id, status: "synced", provider: "google", calendar_event_id: "msr-calendar-viewing" },
  ]);

  rows.push({
    ...rows[0],
    id: "viewing-hidden-from-session",
    lead_id: "lead-hidden-from-session",
    listing_reference: "MS-HIDDEN",
  });
  const calendar = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/viewings.ics`, { headers: { cookie: "ms_admin=payload.jwt.session" } }),
    { config },
  );
  const calendarBody = await calendar.text();
  assert.equal(calendar.status, 200);
  assert.match(calendarBody, /MS Realty viewing MS-99/);
  assert.doesNotMatch(calendarBody, /MS Realty viewing MS-HIDDEN/);

  const viewingsPage = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/viewings`, { headers: { cookie: "ms_admin=payload.jwt.session" } }),
    { config },
  );
  const viewingsHtml = await viewingsPage.text();
  assert.equal(viewingsPage.status, 200);
  assert.match(viewingsHtml, /data-viewing-follow-up-read-only="true"/);
  assert.doesNotMatch(viewingsHtml, /data-viewing-follow-up-actions="true"/);

  const retry = await renderAppAdminResponse(request(), { config });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent, true);
  assert.equal(rows.length, 2);
});

test("logout revokes the Payload session before clearing its browser cookie", async () => {
  const calls = [];
  const service = {
    async logout(token) {
      calls.push(token);
      return true;
    },
  };
  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/logout`, { method: "POST", headers: { cookie: "ms_admin=payload.jwt.session" } }),
    { config: adapterConfig(service) },
  );
  assert.equal(response.status, 303);
  assert.deepEqual(calls, ["payload.jwt.session"]);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});
