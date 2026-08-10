import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  createPayloadAdminAuthService,
  payloadAdminPrincipal,
} from "../lib/payload-admin-auth.mjs";

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

test("Payload browser sessions never become MCP bearer credentials; named bearer MCP stays compatible", async () => {
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
  assert.equal(sessionResponse.status, 403);
  assert.doesNotMatch(await sessionResponse.text(), /payload\.jwt\.session/);

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
