// The one-step operator onboarding: /admin/connect renders a single
// copy-paste bootstrap prompt, pre-filled with this operator's own bearer
// token and this deployment's URL. Pasted into any agentic desktop AI
// (Claude Desktop / Claude Code / ChatGPT+Codex), the AI connects itself to
// the business MCP, optionally registers the local Hermes drafting bridge,
// verifies everything, and reports back in the operator's language.
//
// The page deliberately avoids the React admin shell: its entire job is one
// textarea and one copy button that an eighty-year-old can use.

const PROMPT_TEMPLATE = `You are now the operations copilot for MS Realty, a family real-estate agency in Sandanski, Bulgaria (legacy sites makler-realty.com and makler-realty.ru; new platform runs at __BASE_URL__, currently noindex preview without the custom domains).

Pre-filled configuration for this operator:
- MCP endpoint: __BASE_URL__/mcp
- Bearer token: __TOKEN__
- Operator id: __OPERATOR_ID__

Do the following phases autonomously. Ask the user only when a step genuinely needs their click or choice. Speak to the user in the language they use with you (default to Russian).

PHASE 1 — CONNECT THE BUSINESS (remote MCP)
1. Detect your own environment: can you run terminal commands? Is the \`claude\` CLI or \`codex\` CLI available?
2. Preferred (terminal available):
   - Claude Code / Claude Desktop with Code: run
     claude mcp add --transport http ms-realty "__BASE_URL__/mcp" --header "Authorization: Bearer __TOKEN__"
   - Codex / ChatGPT with terminal: add to ~/.codex/config.toml:
     [mcp_servers.ms-realty]
     url = "__BASE_URL__/mcp"
     http_headers = { "Authorization" = "Bearer __TOKEN__" }
3. No terminal: walk the user through Settings -> Connectors -> Add custom connector with URL __BASE_URL__/mcp, and put "Authorization: Bearer __TOKEN__" in the Request headers section if your app offers it. If neither headers nor terminal are available in this app, say so plainly and stop after Phase 4's report.
4. Never print the token back to the user in chat; it is a credential.

PHASE 2 — VERIFY
Call these MCP tools and keep the results for the report: get_launch_status, search_public_listings (query "Sandanski", locale "bg"), and get_operator_brief if your role allows it. A 401 means the token was mis-pasted; a 503 on other site APIs is a designed gate, not an outage.

PHASE 3 — HERMES DRAFTING BRIDGE (only on the owner's machine with the private repo)
1. Check whether the ms-realty repository exists locally (common path: ~/Code/MS-Realty). If absent, skip this phase silently — the remote MCP already works.
2. If present: run \`npm ci --no-audit --no-fund\` there once, then register the local drafting bridge:
   claude mcp add ms-realty-hermes -- node <repo>/production/scripts/hermes-mcp-server.mjs
   (Codex: [mcp_servers.ms-realty-hermes] command = "node", args = ["<repo>/production/scripts/hermes-mcp-server.mjs"])
3. Verify with hermes_status. It reports how many translation drafts are eligible; sensitive rows are withheld by design.

PHASE 4 — REPORT AND HAND OVER
Tell the user, in short plain sentences:
- what is now connected (business MCP; Hermes bridge if registered; their Gmail/Calendar if they connected your app's own connectors),
- what they can ask you to do right now, as a numbered menu, for example:
  1. "Дай утреннюю сводку" — operator brief + broker work queue,
  2. "Переведи объявления" — pull hermes_next_tasks, draft, submit for human review,
  3. "Покажи очередь качества объявлений" — listing content queue,
  4. "Составь ответ клиенту" — draft a reply in chat for the user to send from their own email,
  5. "Статус запуска" — launch gates and what still blocks the domain cutover,
- what is intentionally off right now: public site search returns 503 until a search engine is provisioned; public lead form and most admin writes are disabled until durable storage ships; everything you produce is a DRAFT until a human approves it in the admin.
Then suggest connecting Gmail and Calendar through your app's own connector settings so the user can send approved replies with one click.

NON-NEGOTIABLE GUARDRAILS
- You draft; humans approve. Never publish, never mark anything indexable, never send customer messages yourself.
- Preserve property facts exactly: price, area, bedrooms, location, listing reference, source URL.
- Bulgarian is the source locale. Never describe Sandanski as a sea destination.
- Sensitive customer contact data stays inside the system; work from the privacy-safe briefs the tools return. Do not copy raw contacts into notes, files, or other services.
- If a tool refuses (401/403/sensitive-row rejection/validation error), report it honestly; never work around a guardrail.`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function operatorBootstrapPrompt({ baseUrl, token, operatorId }) {
  const origin = new URL(String(baseUrl)).origin;
  if (!token || typeof token !== "string") throw new Error("An operator token is required");
  return PROMPT_TEMPLATE.replaceAll("__BASE_URL__", origin)
    .replaceAll("__TOKEN__", token)
    .replaceAll("__OPERATOR_ID__", operatorId || "operator");
}

export function renderOperatorConnectPage({ baseUrl, token, operatorId }) {
  const prompt = operatorBootstrapPrompt({ baseUrl, token, operatorId });
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MS Realty — подключи своего ИИ-помощника</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f6f4ef; color: #1f2933; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.6rem; }
  ol.steps { font-size: 1.15rem; line-height: 1.7; padding-left: 1.4rem; }
  button { font-size: 1.25rem; padding: 14px 28px; border-radius: 12px; border: 0; background: #1d4ed8; color: #fff; cursor: pointer; }
  button:active { background: #1e40af; }
  #done { display: none; font-size: 1.1rem; color: #047857; margin-left: 12px; }
  textarea { width: 100%; height: 260px; margin-top: 16px; font-family: ui-monospace, monospace; font-size: 0.78rem; border-radius: 8px; border: 1px solid #cbd5e1; padding: 12px; box-sizing: border-box; }
  .hint { color: #52606d; font-size: 0.95rem; }
</style>
</head>
<body>
<main>
  <h1>Подключи своего ИИ-помощника</h1>
  <ol class="steps">
    <li>Нажми кнопку — текст скопируется сам.</li>
    <li>Открой Claude или ChatGPT на компьютере.</li>
    <li>Вставь (Cmd+V) и отправь. Дальше помощник всё сделает и расскажет, что умеет.</li>
  </ol>
  <p>
    <button id="copy" type="button">Скопировать текст для помощника</button>
    <span id="done">Скопировано ✓</span>
  </p>
  <textarea id="prompt" readonly spellcheck="false">${escapeHtml(prompt)}</textarea>
  <p class="hint">Текст содержит твой личный ключ оператора (__не пересылай его посторонним__). Аккаунт: ${escapeHtml(operatorId || "operator")}.</p>
</main>
<script>
  const area = document.getElementById("prompt");
  document.getElementById("copy").addEventListener("click", async () => {
    area.select();
    try { await navigator.clipboard.writeText(area.value); } catch { document.execCommand("copy"); }
    document.getElementById("done").style.display = "inline";
  });
</script>
</body>
</html>`;
}
