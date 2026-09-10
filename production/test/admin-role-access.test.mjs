import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { canAdminAccess } from "../lib/admin-auth.mjs";
import { ADMIN_PAGE_SURFACES } from "../lib/owner-operator-catalog.mjs";

const TOKENS = {
  admin: "role-admin-token-0123456789abcdef",
  broker: "role-broker-token-0123456789abcdef",
  editor: "role-editor-token-0123456789abcdef",
  translator: "role-translator-token-0123456789abcdef",
  agent: "role-agent-token-0123456789abcdef",
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

test("media, documents and locales retain role permissions through both real page adapters", async () => {
  await withRoleCredentials(async (headers) => {
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
    const surfaces = ADMIN_PAGE_SURFACES.filter((surface) => ["media_library", "document_records", "locale_rollout"].includes(surface.id));
    for (const [role, auth] of Object.entries(headers)) {
      const principal = { roles: [role] };
      const expected = ADMIN_PAGE_SURFACES.filter((surface) =>
        canAdminAccess(principal, surface.capability) &&
        !["lead_pipeline", "requests"].includes(surface.id) &&
        (surface.id !== "approved_content" || canAdminAccess(principal, "content:write")),
      ).map((surface) => surface.id).sort();
      for (const locale of ["bg", "ru", "en"]) {
        for (const surface of surfaces) {
          const url = `${surface.path}?locale=${locale}`;
          const standalone = await dispatchHttp(app, { url, headers: auth });
          const next = await renderAppAdminResponse(new Request(`https://example.test${url}`, { headers: auth }));
          for (const [adapter, status, body] of [["standalone", standalone.status, standalone.body], ["Next", next.status, await next.text()]]) {
            const context = `${adapter}/${role}/${locale}/${surface.id}`;
            assert.equal(status, canAdminAccess(principal, surface.capability) ? 200 : 403, context);
            if (status === 403) continue;
            for (const navClass of ["crm-sb__nav", "adm-mobile-nav__links"]) {
              const nav = body.match(new RegExp(`<nav class="${navClass}"[\\s\\S]*?</nav>`))?.[0];
              assert.ok(nav, `${context}: ${navClass}`);
              const routes = [...nav.matchAll(/data-admin-nav-route="([^"]+)"/g)].map((match) => match[1]).sort();
              assert.deepEqual(routes, expected, `${context}: only permitted destinations`);
            }
            if (!canAdminAccess(principal, "administration:write")) assert.doesNotMatch(body, /action="\/api\/admin\/locales"/, context);
          }
        }
        if (!canAdminAccess(principal, "administration:write")) {
          const url = `/api/admin/locales?locale=${locale}`;
          assert.equal((await dispatchHttp(app, { method: "POST", url, headers: auth, body: {} })).status, 403);
          assert.equal((await renderAppAdminResponse(new Request(`https://example.test${url}`, { method: "POST", headers: auth, body: "{}" }))).status, 403);
        }
      }
    }
  });
});

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
    assert.equal(
      (await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/replies/draft",
        headers: headers.translator,
        body: { leadId: "unknown", language: "en" },
      })).status,
      403,
    );
    assert.equal(
      (await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/replies",
        headers: headers.translator,
        body: { leadId: "unknown", reviewedReply: "No role bypass.", reviewer: "translator_operator", approved: true },
      })).status,
      403,
    );

    const reviewerSpoof = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      headers: headers.broker,
      body: { leadId: "unknown", reviewedReply: "No reviewer spoof.", reviewer: "admin_operator", approved: true },
    });
    assert.equal(reviewerSpoof.status, 400);
    assert.match(reviewerSpoof.body.message, /Submitted reviewer must match the authenticated operator/);

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
