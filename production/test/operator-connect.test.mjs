import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  DEFAULT_CODEX_MARKETPLACE_PATH,
  buildOperatorConnectPayload,
  operatorBootstrapPrompt,
  operatorCodexPluginUrl,
} from "../lib/operator-connect.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderHtmlPage } from "../lib/html.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";

const OPERATOR_TOKEN = "connect-operator-token-0123456789";

async function withNamedOperator(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
    MS_REALTY_PUBLIC_ORIGIN: process.env.MS_REALTY_PUBLIC_ORIGIN,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    delete process.env.MS_REALTY_PUBLIC_ORIGIN;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "connect_operator", token: OPERATOR_TOKEN, roles: ["admin"] },
    ]);
    return await fn({ authorization: `Bearer ${OPERATOR_TOKEN}` });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("bootstrap prompt embeds the operator's endpoint, token, and guardrails", () => {
  const prompt = operatorBootstrapPrompt({
    baseUrl: "https://ms-realty.example.workers.dev/some/path",
    token: OPERATOR_TOKEN,
    operatorId: "connect_operator",
  });
  assert.ok(prompt.includes("https://ms-realty.example.workers.dev/mcp"));
  assert.ok(prompt.includes(`Bearer ${OPERATOR_TOKEN}`));
  assert.ok(prompt.includes("connect_operator"));
  assert.ok(prompt.includes("hermes-mcp-server.mjs"));
  assert.ok(prompt.includes("Never describe Sandanski as a sea destination"));
  assert.ok(prompt.includes("humans approve"));
  assert.throws(() => operatorBootstrapPrompt({ baseUrl: "https://x.test", token: "" }), /operator token/i);
});

test("connections payload renders the persistent owner shell without credential material", () => {
  const registry = loadLocaleRegistry();
  const render = (locale) => {
    const page = buildOperatorConnectPayload({
      registry,
      requestedLocale: locale,
      operator: { id: "connect_operator", source: "test", can_mutate: true, roles: ["admin"], workspace_ids: [] },
    });
    return renderHtmlPage(page, { bodyHtml: renderReactAdminBody(page) });
  };
  const html = render("en");
  assert.ok(html.includes('class="crm-app"'));
  assert.ok(html.includes('data-kind="admin_connections"'));
  assert.ok(html.includes('data-provider="google"'));
  assert.ok(html.includes('data-provider="whatsapp"'));
  assert.equal(html.includes('data-provider="viber"'), false);
  assert.equal(html.includes('data-provider="github"'), false);
  assert.ok(html.includes('data-managed-system="hermes"'));
  assert.ok(html.includes('data-managed-system="data"'));
  assert.ok(html.includes('data-codex-plugin-install="ms-realty-operator"'));
  assert.ok(html.includes(operatorCodexPluginUrl()));
  assert.equal(html.includes(OPERATOR_TOKEN), false);
  assert.doesNotMatch(html, /<input[^>]+type="password"/);
  assert.doesNotMatch(html, /name="token"/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const [locale, marker, lang] of [
    ["bg", "Работни акаунти", "bg"],
    ["ru", "Рабочие аккаунты", "ru"],
  ]) {
    const localised = render(locale);
    assert.ok(localised.includes(marker), locale);
    assert.ok(localised.includes(`<html lang="${lang}" dir="ltr">`), locale);
  }
});

test("Codex plugin link targets the owner marketplace without carrying credentials", () => {
  const url = operatorCodexPluginUrl();
  assert.equal(
    url,
    `codex://plugins/ms-realty-operator?marketplacePath=${encodeURIComponent(DEFAULT_CODEX_MARKETPLACE_PATH)}`,
  );
  assert.equal(url.includes(OPERATOR_TOKEN), false);
  assert.throws(() => operatorCodexPluginUrl({ marketplacePath: "relative/marketplace.json" }), /absolute local path/);
});

test("standalone HTTP runtime serves /admin/connect behind admin auth", async () => {
  await withNamedOperator(async (headers) => {
    const app = createHttpApp({
      reviewedAt: "2026-07-19T12:00:00.000Z",
      providerConnection: {
        publicOrigin: "https://ms-realty.ms-realty-bg.workers.dev",
        credentialSecret: "",
        stateSecret: "",
        payloadSecret: "",
        databaseUrl: "",
        webhookMaxBytes: 1024 * 1024,
      },
    });
    const denied = await dispatchHttp(app, { method: "GET", url: "/admin/connect", headers: {} });
    assert.equal(denied.status, 401);

    const page = await dispatchHttp(app, {
      method: "GET",
      url: "/admin/connect",
      headers: { ...headers, host: "ms-realty.ms-realty-bg.workers.dev" },
    });
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.ok(page.body.includes('data-react-admin-ui="connections"'));
    assert.ok(page.body.includes('data-provider="google"'));
    assert.ok(page.body.includes('data-provider="whatsapp"'));
    assert.equal(page.body.includes(OPERATOR_TOKEN), false);
  });
});

test("Next admin adapter serves the same credential-free owner connection shell", async () => {
  await withNamedOperator(async (headers) => {
    const denied = await renderAppAdminResponse(new Request("https://ms-realty.ms-realty-bg.workers.dev/admin/connect"));
    assert.equal(denied.status, 401);

    const response = await renderAppAdminResponse(
      new Request("https://ms-realty.ms-realty-bg.workers.dev/admin/connect", { headers }),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const body = await response.text();
    assert.ok(body.includes('data-react-admin-ui="connections"'));
    assert.ok(body.includes('data-provider="google"'));
    assert.ok(body.includes('data-provider="whatsapp"'));
    assert.equal(body.includes(OPERATOR_TOKEN), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
