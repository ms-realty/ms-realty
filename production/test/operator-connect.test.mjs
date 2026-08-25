import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { operatorBootstrapPrompt, renderOperatorConnectPage } from "../lib/operator-connect.mjs";

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

test("connect page renders one-step copy UI with an escaped prompt", () => {
  const html = renderOperatorConnectPage({
    baseUrl: "https://ms-realty.example.workers.dev",
    token: OPERATOR_TOKEN,
    operatorId: "connect_operator",
  });
  // The page speaks the workbench languages; it used to be fixed to Russian.
  assert.ok(html.includes("Copy the text for the assistant"));
  assert.ok(html.includes("Gmail"));
  assert.ok(html.includes("WhatsApp Business"));
  assert.ok(html.includes("Viber"));
  assert.match(html, /<label class="hint" for="prompt">[^<]+<\/label>\s*<textarea id="prompt"/);
  assert.ok(html.includes("noindex"));
  assert.ok(html.includes(OPERATOR_TOKEN));
  assert.equal(html.includes("<script>alert"), false);
  for (const [locale, marker, lang] of [
    ["bg", "Копирай текста за помощника", "bg"],
    ["ru", "Скопировать текст для помощника", "ru"],
  ]) {
    const localised = renderOperatorConnectPage({
      baseUrl: "https://ms-realty.example.workers.dev",
      token: OPERATOR_TOKEN,
      operatorId: "connect_operator",
      locale,
    });
    assert.ok(localised.includes(marker), locale);
    assert.ok(localised.includes(`<html lang="${lang}">`), locale);
  }
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
    assert.ok(page.body.includes("https://ms-realty.ms-realty-bg.workers.dev/mcp"));
    assert.ok(page.body.includes(OPERATOR_TOKEN));
  });
});

test("Next admin adapter serves /admin/connect with identical prompt material", async () => {
  await withNamedOperator(async (headers) => {
    const denied = await renderAppAdminResponse(new Request("https://ms-realty.ms-realty-bg.workers.dev/admin/connect"));
    assert.equal(denied.status, 401);

    const response = await renderAppAdminResponse(
      new Request("https://ms-realty.ms-realty-bg.workers.dev/admin/connect", { headers }),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const body = await response.text();
    assert.ok(body.includes("https://ms-realty.ms-realty-bg.workers.dev/mcp"));
    assert.ok(body.includes(OPERATOR_TOKEN));
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
