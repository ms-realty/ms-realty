import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const TOKENS = {
  admin: "role-admin-token-0123456789abcdef",
  broker: "role-broker-token-0123456789abcdef",
  editor: "role-editor-token-0123456789abcdef",
  translator: "role-translator-token-0123456789abcdef",
};

async function withRoleCredentials(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify(
      Object.entries(TOKENS).map(([role, token]) => ({ id: `${role}_operator`, token, roles: [role] })),
    );
    return await fn(Object.fromEntries(Object.entries(TOKENS).map(([role, token]) => [role, { authorization: `Bearer ${token}` }])));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("standalone admin routes enforce role capabilities and hide unavailable workspaces", async () => {
  await withRoleCredentials(async (headers) => {
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });

    const brokerRoot = await dispatchHttp(app, { url: "/admin?locale=en", headers: headers.broker });
    assert.equal(brokerRoot.headers.location, "/admin/today?locale=en");
    const brokerToday = await dispatchHttp(app, { url: "/admin/today", headers: headers.broker });
    assert.equal(brokerToday.status, 200);
    assert.match(brokerToday.body, /href="\/admin\/listings"/);
    assert.doesNotMatch(brokerToday.body, /href="\/admin\/translations"/);
    assert.match(brokerToday.body, /href="\/admin\/activity"/);
    const brokerActivity = await dispatchHttp(app, { url: "/api/admin/activity", headers: headers.broker });
    assert.equal(brokerActivity.status, 200);
    assert.equal(brokerActivity.body.workspace.operator_id, "broker_operator");

    const editorRoot = await dispatchHttp(app, { url: "/admin?locale=bg", headers: headers.editor });
    assert.equal(editorRoot.headers.location, "/admin/listings?locale=bg");
    assert.equal((await dispatchHttp(app, { url: "/admin/listings", headers: headers.editor })).status, 200);
    assert.equal((await dispatchHttp(app, { url: "/admin/today", headers: headers.editor })).status, 403);

    const translatorRoot = await dispatchHttp(app, { url: "/admin?locale=ru", headers: headers.translator });
    assert.equal(translatorRoot.headers.location, "/admin/translations?locale=ru");
    const translatorQueue = await dispatchHttp(app, { url: "/api/admin/translations", headers: headers.translator });
    assert.equal(translatorQueue.status, 200);
    assert.deepEqual(translatorQueue.body.workspace.operator_roles, ["translator"]);
    assert.equal(
      (await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/translations/publish",
        headers: headers.translator,
        body: {},
      })).status,
      403,
    );
    assert.equal(
      (await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/listings/edit",
        headers: headers.translator,
        body: {},
      })).status,
      403,
    );

    const commission = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers: headers.broker,
      body: { sellerPipelineId: "unknown", action: "sale_completed", salePriceEur: 100000, commissionEur: 3000 },
    });
    assert.deepEqual(commission.body, { kind: "forbidden", required_capability: "financials:write" });
    const ordinaryBrokerOutcome = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers: headers.broker,
      body: { sellerPipelineId: "unknown", action: "sale_completed", salePriceEur: 100000 },
    });
    assert.equal(ordinaryBrokerOutcome.status, 400);

    const adminActivity = await dispatchHttp(app, { url: "/api/admin/activity", headers: headers.admin });
    assert.equal(adminActivity.status, 200);
    assert.deepEqual(adminActivity.body.workspace.operator_roles, ["admin"]);
  });
});

test("Next admin adapter uses the same role boundary", async () => {
  await withRoleCredentials(async (headers) => {
    const forbidden = await renderAppAdminResponse(
      new Request("https://example.test/admin/today", { headers: headers.editor }),
    );
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { kind: "forbidden", required_capability: "operations:read" });

    const listings = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings", { headers: headers.editor }),
    );
    assert.equal(listings.status, 200);
    const payload = await listings.json();
    assert.deepEqual(payload.workspace.operator_roles, ["editor"]);
    assert.ok(payload.workspace.operator_capabilities.includes("content:write"));
  });
});
