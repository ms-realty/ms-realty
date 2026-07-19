import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

async function withNamedOperator(fn) {
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
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "surface_parity_operator", token: "surface-parity-token-0123456789" },
    ]);
    return await fn({ authorization: "Bearer surface-parity-token-0123456789" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("standalone HTTP runtime serves every task-first broker workspace linked by the admin shell", async () => {
  await withNamedOperator(async (headers) => {
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
    const surfaces = [
      ["today", "admin_today"],
      ["leads", "admin_lead_inbox"],
      ["pipeline", "admin_lead_pipeline"],
      ["requests", "admin_requests"],
      ["viewings", "admin_viewings"],
      ["listings", "admin_listing_manager"],
      ["translations", "admin_translation_queue"],
      ["reports", "admin_operations_reports"],
      ["activity", "admin_activity"],
    ];

    const rootUnauthorized = await dispatchHttp(app, { url: "/admin?locale=ru" });
    assert.equal(rootUnauthorized.status, 401);
    const root = await dispatchHttp(app, { url: "/admin?locale=ru", headers });
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, "/admin/today?locale=ru");

    for (const [surface, kind] of surfaces) {
      const page = await dispatchHttp(app, { url: `/admin/${surface}?locale=ru`, headers });
      assert.equal(page.status, 200, `${surface} HTML status`);
      assert.match(page.headers["content-type"], /^text\/html/, `${surface} HTML content type`);
      assert.equal(page.headers["cache-control"], "no-store", `${surface} private caching`);
      assert.match(page.body, /lang="ru"/, `${surface} language`);
      assert.match(page.body, new RegExp(`href="/admin/${surface}\\?locale=ru"`), `${surface} active navigation target`);

      const api = await dispatchHttp(app, { url: `/api/admin/${surface}?locale=ru`, headers });
      assert.equal(api.status, 200, `${surface} JSON status`);
      assert.equal(api.body.kind, kind, `${surface} payload kind`);
      assert.equal(api.body.locale, "ru", `${surface} payload locale`);
      assert.equal(api.body.workspace.operator_id, "surface_parity_operator", `${surface} named operator`);
      assert.equal(api.headers["cache-control"], "no-store", `${surface} JSON private caching`);
    }
  });
});
