import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  CHATGPT_APP_URL,
  DEFAULT_CODEX_MARKETPLACE_PATH,
  operatorAgentConfigBlock,
  operatorBootstrapPrompt,
  operatorCodexPluginUrl,
  renderOperatorConnectPage,
} from "../lib/operator-connect.mjs";

const OPERATOR_TOKEN = "connect-operator-token-0123456789";
const EXPANDABLE_CLAUDE_HEADER = '--header "Authorization: Bearer ${MS_REALTY_OPERATOR_TOKEN}"';
const LITERAL_CLAUDE_HEADER = "--header 'Authorization: Bearer ${MS_REALTY_OPERATOR_TOKEN}'";

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

test("bootstrap prompt references the operator token environment without persisting it", () => {
  const prompt = operatorBootstrapPrompt({
    baseUrl: "https://ms-realty.example.workers.dev/some/path",
    operatorId: "connect_operator",
  });
  assert.ok(prompt.includes("https://ms-realty.example.workers.dev/mcp"));
  assert.ok(prompt.includes("MS_REALTY_OPERATOR_TOKEN"));
  assert.ok(prompt.includes('bearer_token_env_var = "MS_REALTY_OPERATOR_TOKEN"'));
  assert.ok(prompt.includes(EXPANDABLE_CLAUDE_HEADER));
  assert.equal(prompt.includes(LITERAL_CLAUDE_HEADER), false);
  assert.equal(prompt.includes(OPERATOR_TOKEN), false);
  assert.equal(prompt.includes("http_headers"), false);
  assert.ok(prompt.includes("connect_operator"));
  assert.ok(prompt.includes("hermes-mcp-server.mjs"));
  assert.ok(prompt.includes("Never describe Sandanski as a sea destination"));
  assert.ok(prompt.includes("humans approve"));
});

test("assistant config never persists the issued token in headers", () => {
  const config = operatorAgentConfigBlock({
    baseUrl: "https://ms-realty.example.workers.dev/some/path",
    token: OPERATOR_TOKEN,
    operatorId: "connect_operator",
  });
  assert.ok(config.includes("MS_REALTY_OPERATOR_TOKEN"));
  assert.ok(config.includes('bearer_token_env_var = "MS_REALTY_OPERATOR_TOKEN"'));
  assert.ok(config.includes(EXPANDABLE_CLAUDE_HEADER));
  assert.equal(config.includes(LITERAL_CLAUDE_HEADER), false);
  assert.equal(config.includes(OPERATOR_TOKEN), false);
  assert.equal(config.includes(`Authorization: Bearer ${OPERATOR_TOKEN}`), false);
  assert.equal(config.includes("http_headers"), false);
});

test("connect page renders one-step copy UI with an escaped prompt", () => {
  const html = renderOperatorConnectPage({
    baseUrl: "https://ms-realty.example.workers.dev",
    token: OPERATOR_TOKEN,
    agentToken: OPERATOR_TOKEN,
    operatorId: "connect_operator",
  });
  // The page speaks the workbench languages; it used to be fixed to Russian.
  assert.ok(html.includes("Copy the text for the assistant"));
  assert.ok(html.includes("Gmail"));
  assert.ok(html.includes("WhatsApp Business"));
  assert.ok(html.includes("Viber"));
  assert.match(html, /<label class="hint" for="prompt">[^<]+<\/label>\s*<textarea id="prompt"/);
  assert.ok(html.includes("noindex"));
  assert.ok(html.includes('data-codex-plugin-install="ms-realty-operator"'));
  assert.ok(html.includes(operatorCodexPluginUrl()));
  assert.ok(html.includes(`href="${CHATGPT_APP_URL}" target="_blank" rel="noopener noreferrer" data-chatgpt-open="ms-realty-operator"`));
  assert.ok(html.includes("Open ChatGPT Home"));
  assert.ok(html.includes("this link does not install or connect anything"));
  assert.match(html, /<label for="agent-credential">Short-lived key for MS_REALTY_OPERATOR_TOKEN<\/label>/);
  assert.match(html, new RegExp(`<input class="agent__credential" id="agent-credential" type="password" value="${OPERATOR_TOKEN}" readonly`));
  assert.match(html, /data-copy-block="agent-credential"[^>]*>Copy the key<\/button>/);
  const configBlock = html.match(/<pre class="agent__config"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || "";
  const promptBlock = html.match(/<textarea id="prompt"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] || "";
  assert.equal(configBlock.includes(OPERATOR_TOKEN), false);
  assert.equal(promptBlock.includes(OPERATOR_TOKEN), false);
  assert.equal(html.split(OPERATOR_TOKEN).length - 1, 1);
  assert.equal(html.includes("<script>alert"), false);
  for (const [locale, marker, chatGptLabel, lang] of [
    ["bg", "Копирай текста за помощника", "Отвори началната страница на ChatGPT", "bg"],
    ["ru", "Скопировать текст для помощника", "Открыть главную страницу ChatGPT", "ru"],
  ]) {
    const localised = renderOperatorConnectPage({
      baseUrl: "https://ms-realty.example.workers.dev",
      token: OPERATOR_TOKEN,
      agentToken: OPERATOR_TOKEN,
      operatorId: "connect_operator",
      locale,
    });
    assert.ok(localised.includes(marker), locale);
    assert.ok(localised.includes(chatGptLabel), locale);
    assert.ok(localised.includes(`<html lang="${lang}">`), locale);
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

test("ChatGPT action opens the supported app entry point without credentials", () => {
  assert.equal(CHATGPT_APP_URL, "https://chatgpt.com/");
  const html = renderOperatorConnectPage({ baseUrl: "https://ms-realty.example.workers.dev", operatorId: "connect_operator" });
  assert.ok(html.includes(`href="${CHATGPT_APP_URL}" target="_blank"`));
  assert.ok(html.includes("Open ChatGPT Home"));
  assert.ok(html.includes("Then open this signed-in admin page"));
  assert.equal(html.includes(`${CHATGPT_APP_URL}?token=`), false);
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
    assert.ok(page.body.includes("MS_REALTY_OPERATOR_TOKEN"));
    assert.equal(page.body.includes(OPERATOR_TOKEN), false);
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
    assert.ok(body.includes("MS_REALTY_OPERATOR_TOKEN"));
    assert.equal(body.includes(OPERATOR_TOKEN), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
