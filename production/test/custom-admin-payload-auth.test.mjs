import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { appendAdminSessionEvent, createAdminSessionOpened, createAdminSessionRevoked } from "../lib/admin-sessions.mjs";
import { activateOperatorEnrolment, appendOperatorTwoFactorEvent, createOperatorEnrolment } from "../lib/operator-two-factor.mjs";
import {
  assignableBrokerProfiles,
  createPayloadAdminAuthService,
  payloadAdminPasswordChangeFailureCode,
  payloadAdminPrincipal,
} from "../lib/payload-admin-auth.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";
import { totpCode } from "../lib/totp.mjs";

const BASE_URL = "https://ms-realty.ms-realty-bg.workers.dev";
const NOW_SECONDS = 1_786_377_600;

test("assignable broker profiles include only identified admins and brokers", () => {
  assert.deepEqual(
    assignableBrokerProfiles([
      { id: 1, email: "owner@example.test", name: "Owner", role: "admin" },
      { id: 2, email: "broker@example.test", role: "broker" },
      { id: 3, email: "editor@example.test", role: "editor" },
      { email: "missing-id@example.test", role: "broker" },
    ]),
    [
      { id: "1", email: "owner@example.test", name: "Owner", languages: [] },
      { id: "2", email: "broker@example.test", name: "broker@example.test", languages: [] },
    ],
  );
});

function user(overrides = {}) {
  return {
    id: 1,
    collection: "admins",
    email: "peycheff.com@gmail.com",
    name: "MS Realty Admin",
    role: "admin",
    workspace_ids: ["sandanski"],
    password_change_required: false,
    ...overrides,
  };
}

function fakePayload(overrides = {}) {
  const calls = [];
  let admin = user(overrides);
  let adminPassword = "correct-password";
  return {
    calls,
    collections: { admins: { config: { slug: "admins" } } },
    async login(options) {
      calls.push(["login", options]);
      if (options.data.email !== admin.email || options.data.password !== adminPassword) {
        const error = new Error("Authentication failed for a secret reason");
        error.name = "AuthenticationError";
        error.status = 401;
        throw error;
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
    async update(options) {
      calls.push(["update", options]);
      if (typeof options.data.password === "string") adminPassword = options.data.password;
      admin = user({ ...admin, ...options.data });
      return admin;
    },
  };
}

function adapterConfig(payloadAdminAuth, authEnv = {}) {
  // A sign-in through the adapter now registers the browser session and
  // records the attempt, so the ledgers have to be this test's own rather
  // than the ones the repository ships with.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-auth-"));
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    authEnv: { NODE_ENV: "production", ...authEnv },
    adminSessionLedgerPath: path.join(directory, "admin-sessions.jsonl"),
    auditLogPath: path.join(directory, "audit-log.jsonl"),
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
    password_change_required: false,
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
  assert.equal(created.password_change_required, true);
  for (const operation of ["find", "create"]) {
    const options = payload.calls.find(([name]) => name === operation)[1];
    assert.equal(options.collection, "admins");
    assert.equal(options.overrideAccess, false);
    assert.equal(options.user.id, 1);
  }

  const changed = await service.changePassword(session, {
    current_password: "correct-password",
    password: "a-different-password",
    password_confirmation: "a-different-password",
  });
  assert.equal(changed.password_change_required, false);
  const update = payload.calls.find(([name]) => name === "update")[1];
  assert.equal(update.id, 1);
  assert.equal(update.overrideAccess, true);
  assert.equal(update.data.password_change_required, false);
  assert.deepEqual(update.data.sessions, []);
  assert.equal(await service.logout("payload.jwt.session"), true);
  assert.equal(revoked.length, 2);
  assert.equal(revoked[0].user.id, 1);
  assert.equal(await service.logout("tampered"), false);
});

test("password-change failures expose only fixed safe reason codes", async () => {
  const service = createPayloadAdminAuthService(fakePayload({ password_change_required: true }), {
    revokePayloadSession: async () => true,
  });
  const session = await service.resolve("payload.jwt.session");
  const cases = [
    [{ current_password: "", password: "replacement-password", password_confirmation: "replacement-password" }, "missing_fields"],
    [{ current_password: "correct-password", password: "short", password_confirmation: "short" }, "password_too_short"],
    [{ current_password: "correct-password", password: "replacement-password", password_confirmation: "different-password" }, "confirmation_mismatch"],
    [{ current_password: "correct-password", password: "correct-password", password_confirmation: "correct-password" }, "same_password"],
    [{ current_password: "wrong-password", password: "replacement-password", password_confirmation: "replacement-password" }, "current_password_rejected"],
  ];
  for (const [input, expected] of cases) {
    await assert.rejects(() => service.changePassword(session, input), (error) => {
      assert.equal(payloadAdminPasswordChangeFailureCode(error), expected);
      return true;
    });
  }
  assert.equal(payloadAdminPasswordChangeFailureCode(new Error("database detail")), "service_unavailable");
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

test("a temporary-password account must replace it before any admin page or API is reachable", async () => {
  const payload = fakePayload({ password_change_required: true });
  const revoked = [];
  const service = createPayloadAdminAuthService(payload, {
    revokePayloadSession: async (args) => revoked.push(args),
  });
  const config = adapterConfig(service);

  const login = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "peycheff.com@gmail.com", password: "correct-password" }),
    }),
    { config },
  );
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "/admin/login?change=1");
  const cookie = cookieFrom(login);

  const changePage = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login?change=1&locale=en`, { headers: { cookie } }),
    { config },
  );
  const changeHtml = await changePage.text();
  assert.equal(changePage.status, 200);
  assert.match(changeHtml, /name="current_password"/);
  assert.match(changeHtml, /name="password_confirmation"/);
  assert.match(changeHtml, /Change the temporary password/);

  const blockedPage = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/today`, { headers: { accept: "text/html", cookie } }),
    { config },
  );
  assert.equal(blockedPage.status, 303);
  assert.equal(blockedPage.headers.get("location"), "/admin/login?change=1");

  const blockedApi = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/team`, { headers: { accept: "application/json", cookie } }),
    { config },
  );
  assert.equal(blockedApi.status, 403);
  assert.equal((await blockedApi.json()).kind, "password_change_required");

  const changed = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({
        action: "change-password",
        locale: "en",
        current_password: "correct-password",
        password: "a-different-password",
        password_confirmation: "a-different-password",
      }),
    }),
    { config },
  );
  assert.equal(changed.status, 303);
  assert.equal(changed.headers.get("location"), "/admin/login?password=changed&locale=en");
  assert.match(changed.headers.get("set-cookie"), /Max-Age=0/);
  assert.ok(revoked.length >= 1);

  const notice = await renderAppAdminResponse(new Request(`${BASE_URL}/admin/login?password=changed&locale=en`), { config });
  assert.match(await notice.text(), /Password changed\. Sign in with your new password/);

  const oldPassword = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "peycheff.com@gmail.com", password: "correct-password" }),
    }),
    { config },
  );
  assert.equal(oldPassword.headers.get("location"), "/admin/login?error=1");
});

test("a failed password change redirects with an actionable safe code and logs no credential values", async () => {
  const payload = fakePayload({ password_change_required: true });
  const logs = [];
  const service = createPayloadAdminAuthService(payload, { revokePayloadSession: async () => true });
  const config = { ...adapterConfig(service), adminAuthLogger: (line) => logs.push(line) };
  const login = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "peycheff.com@gmail.com", password: "correct-password" }),
    }),
    { config },
  );
  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieFrom(login) },
      body: new URLSearchParams({
        action: "change-password",
        locale: "bg",
        current_password: "wrong-current-password",
        password: "replacement-password",
        password_confirmation: "replacement-password",
      }),
    }),
    { config },
  );
  assert.equal(response.headers.get("location"), "/admin/login?change=1&error=current_password_rejected");
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    kind: "admin_password_change_failed",
    operator_id: "payload-1",
    reason: "current_password_rejected",
  });
  assert.doesNotMatch(logs[0], /wrong-current-password|replacement-password|peycheff\.com/);
  const page = await renderAppAdminResponse(
    new Request(`${BASE_URL}${response.headers.get("location")}`, { headers: { cookie: cookieFrom(login) } }),
    { config },
  );
  assert.match(await page.text(), /Временната парола не беше приета/);
});

test("a password-change runtime failure exposes and logs only the fixed service code", async () => {
  const payload = fakePayload({ password_change_required: true });
  payload.update = async () => {
    throw new Error("private database failure detail");
  };
  const logs = [];
  const config = {
    ...adapterConfig(createPayloadAdminAuthService(payload, { revokePayloadSession: async () => true })),
    adminAuthLogger: (line) => logs.push(line),
  };
  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: "ms_admin=payload.jwt.session" },
      body: new URLSearchParams({
        action: "change-password",
        current_password: "correct-password",
        password: "replacement-password",
        password_confirmation: "replacement-password",
      }),
    }),
    { config },
  );
  assert.equal(response.headers.get("location"), "/admin/login?change=1&error=service_unavailable");
  assert.equal(JSON.parse(logs[0]).reason, "service_unavailable");
  assert.doesNotMatch(logs[0], /private database failure detail|correct-password|replacement-password/);
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

test("the App Router refuses a revoked session before resolving it, while an active session still works", async () => {
  const service = {
    resolves: 0,
    async resolve(token) {
      service.resolves += 1;
      if (token !== "active-session") return null;
      const admin = user();
      return { user: admin, principal: payloadAdminPrincipal(admin) };
    },
  };
  const config = adapterConfig(service);
  const recordedAt = "2026-08-26T09:00:00.000Z";
  const revoked = createAdminSessionOpened(
    { token: "revoked-session", operatorId: "payload-1", source: "payload_session" },
    recordedAt,
  );
  appendAdminSessionEvent(revoked, { filePath: config.adminSessionLedgerPath });
  appendAdminSessionEvent(
    createAdminSessionRevoked(
      {
        fingerprint: revoked.fingerprint,
        operatorId: "payload-1",
        sessionId: revoked.session_id,
        revokedBy: "payload-1",
      },
      recordedAt,
    ),
    { filePath: config.adminSessionLedgerPath },
  );

  const refused = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/cases/intents`, { headers: { cookie: "ms_admin=revoked-session", accept: "application/json" } }),
    { config },
  );
  assert.equal(refused.status, 401);
  assert.match(refused.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(service.resolves, 0, "a revoked cookie never reaches Payload auth");

  const active = createAdminSessionOpened(
    { token: "active-session", operatorId: "payload-1", source: "payload_session" },
    recordedAt,
  );
  appendAdminSessionEvent(active, { filePath: config.adminSessionLedgerPath });
  const allowed = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/cases/intents`, { headers: { cookie: "ms_admin=active-session", accept: "application/json" } }),
    { config },
  );
  assert.equal(allowed.status, 200);
  assert.equal(service.resolves, 1, "an active registered cookie keeps the admin flow working");
});

test("the App Router renders the full owner navigation and a privacy-safe owner profile", async () => {
  const admin = user({ name: "Ivan Peychev", workspace_ids: [] });
  const service = {
    async resolve(token) {
      return token === "owner-session" ? { user: admin, principal: payloadAdminPrincipal(admin) } : null;
    },
  };
  const config = adapterConfig(service);
  appendAdminSessionEvent(
    createAdminSessionOpened(
      { token: "owner-session", operatorId: "payload-1", source: "payload_session" },
      "2026-08-27T12:00:00.000Z",
    ),
    { filePath: config.adminSessionLedgerPath },
  );

  const response = await renderAppAdminResponse(
    new Request(`${BASE_URL}/admin/settings?locale=ru`, {
      headers: { cookie: "ms_admin=owner-session", accept: "text/html" },
    }),
    { config },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /data-owner-profile="true"/);
  assert.doesNotMatch(html, /data-owner-hub="true"/);
  assert.match(html, /Ivan Peychev/);
  assert.match(html, /peycheff\.com@gmail\.com/);
  assert.match(html, /Все рабочие пространства/);
  for (const route of ["today", "leads", "listings", "hermes", "connect", "settings", "team", "activity"]) {
    assert.match(html, new RegExp(`href="/admin/${route}\\?locale=ru`), `${route} appears in the owner navigation`);
  }
  assert.doesNotMatch(html, /owner-session|payload\.jwt\.session|correct-password/);
});

test("the App Router gates credential-registry work behind step-up while leaving settings reachable", async () => {
  const token = "registry-step-up-token-0123456789abcdef";
  const operatorId = "broker_melnik";
  const authEnv = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
      { id: operatorId, token, roles: ["broker"], workspace_ids: ["melnik"], require_two_factor: true },
    ]),
  };
  const operatorTwoFactorKey = "app-admin-step-up-key-0123456789abcdef";
  const operatorTwoFactorPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-step-up-")),
    "operator-two-factor.jsonl",
  );
  const config = {
    ...adapterConfig(null, authEnv),
    operatorTwoFactorKey,
    operatorTwoFactorPath,
    realtyCaseWorkspaceId: "melnik",
  };
  const recordedAt = "2026-08-26T09:00:00.000Z";
  const enrolment = createOperatorEnrolment(
    { operatorId, account: "broker@example.test" },
    { secret: operatorTwoFactorKey, recordedAt, totpSecret: "JBSWY3DPEHPK3PXP" },
  );
  appendOperatorTwoFactorEvent(enrolment.row, { filePath: operatorTwoFactorPath });
  appendOperatorTwoFactorEvent(
    activateOperatorEnrolment(
      [enrolment.row],
      { operatorId, code: totpCode(enrolment.secret, { timestamp: Date.parse(recordedAt) }) },
      { secret: operatorTwoFactorKey, recordedAt, timestamp: Date.parse(recordedAt) },
    ),
    { filePath: operatorTwoFactorPath },
  );

  const gated = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/activity`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }),
    { config },
  );
  assert.equal(gated.status, 403);
  assert.equal((await gated.json()).kind, "two_factor_required");

  const stepUpToken = "registry-step-up-session-0123456789abcdef";
  appendAdminSessionEvent(
    createAdminSessionOpened({ token: stepUpToken, operatorId, source: "credential_registry" }, recordedAt),
    { filePath: config.adminSessionLedgerPath },
  );
  const allowed = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/activity`, {
      headers: { authorization: `Bearer ${token}`, "x-ms-admin-2fa": stepUpToken, accept: "application/json" },
    }),
    { config },
  );
  assert.equal(allowed.status, 200);

  const settings = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/settings`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }),
    { config },
  );
  assert.equal(settings.status, 200, "the settings exemption remains reachable without step-up");
});

test("credential-registry case access is workspace-scoped on both admin runtimes", async () => {
  const token = "registry-broker-token-0123456789abcdef";
  const authEnv = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
      { id: "broker_melnik", token, roles: ["broker"], workspace_ids: ["melnik"] },
    ]),
  };
  const config = {
    ...adapterConfig(null, authEnv),
    realtyCaseWorkspaceId: "sandanski",
  };
  const denied = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/cases`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }),
    { config },
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).required_capability, "workspace:access");

  const allowed = await renderAppAdminResponse(
    new Request(`${BASE_URL}/api/admin/cases`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }),
    { config: { ...config, realtyCaseWorkspaceId: "melnik" } },
  );
  assert.equal(allowed.status, 200);

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    Object.assign(process.env, authEnv);
    const app = createHttpApp({ realtyCaseWorkspaceId: "sandanski" });
    const legacyDenied = await dispatchHttp(app, {
      url: "/api/admin/cases",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(legacyDenied.status, 403);
    assert.equal(legacyDenied.body.required_capability, "workspace:access");

    const allowedApp = createHttpApp({ realtyCaseWorkspaceId: "melnik" });
    const legacyAllowed = await dispatchHttp(allowedApp, {
      url: "/api/admin/cases",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(legacyAllowed.status, 200);
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.MS_REALTY_ADMIN_CREDENTIALS_JSON === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous.MS_REALTY_ADMIN_CREDENTIALS_JSON;
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
  assert.match(sessionBody, /MS Realty connections/);
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
  const bearerBody = await bearerResponse.text();
  assert.match(bearerBody, /MS_REALTY_OPERATOR_TOKEN/);
  assert.doesNotMatch(bearerBody, new RegExp(token));
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
