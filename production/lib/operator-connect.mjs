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
- what is intentionally off according to get_launch_status; never infer production readiness from this prompt or from a successful login.
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

function connectionFor(connections, provider) {
  return (Array.isArray(connections) ? connections : []).find((connection) => connection.provider === provider) || null;
}

function connectionCard({ provider, title, description, connection, action }) {
  const connected = connection?.status === "connected";
  return `<section class="card" data-provider="${provider}" aria-labelledby="provider-${provider}-title">
    <div class="card__head">
      <div><h2 id="provider-${provider}-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
      <strong class="status ${connected ? "status--ok" : ""}" aria-label="Статус: ${connected ? "подключено" : "не подключено"}">${connected ? "Подключено" : "Не подключено"}</strong>
    </div>
    ${
      connected
        ? `<p class="account">${escapeHtml(connection.account_label || connection.external_account_id || "Провайдер подтвердил аккаунт")}</p>
           <p class="verified">Проверено: ${escapeHtml(connection.last_verified_at || "—")}</p>`
        : action
    }
  </section>`;
}

const inlineJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");

export function renderOperatorConnectPage({
  baseUrl,
  token = "",
  operatorId,
  connections = [],
  availability = {},
  result = "",
}) {
  const prompt = token ? operatorBootstrapPrompt({ baseUrl, token, operatorId }) : "";
  const google = connectionFor(connections, "google");
  const whatsapp = connectionFor(connections, "whatsapp");
  const viber = connectionFor(connections, "viber");
  const googleAction = availability.google?.ready
    ? '<a class="button" href="/api/admin/connections?provider=google&amp;action=start">Подключить Gmail и Calendar</a>'
    : '<p class="blocked">Нужны OAuth credentials и точный public origin. Их добавляет владелец инфраструктуры.</p>';
  const whatsappAction = availability.whatsapp?.ready
    ? '<button class="button" id="whatsapp-connect" type="button" disabled>Подключить WhatsApp Business</button><p id="whatsapp-result" class="verified" role="status" aria-live="polite" aria-atomic="true">Загружаю защищённое подключение Meta…</p>'
    : '<p class="blocked">Нужны Meta App Review, Advanced Access, Embedded Signup config и живой webhook runtime.</p>';
  const viberAction = availability.viber?.ready
    ? `<form method="post" action="/api/admin/connections">
         <input type="hidden" name="provider" value="viber">
         <label for="viber-token">Токен коммерческого Viber-бота</label>
         <input id="viber-token" name="token" type="password" required autocomplete="off" minlength="20">
         <button class="button" type="submit">Проверить и подключить Viber</button>
       </form>`
    : '<p class="blocked">Сначала нужен коммерческий Viber-бот и живой webhook runtime. Самостоятельное создание новых ботов недоступно.</p><p><a href="https://help.viber.com/hc/en-us/articles/15247629658525-Bot-commercial-model" rel="noreferrer noopener">Условия Viber</a></p>';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MS Realty — подключения</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f6f4ef; color: #1f2933; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.3rem); margin-bottom: 8px; }
  h2 { margin: 0 0 6px; font-size: 1.15rem; }
  .intro, .card p { color: #52606d; line-height: 1.5; }
  .grid { display: grid; gap: 14px; margin: 24px 0; }
  .card { background: #fff; border: 1px solid #d9d4c8; border-radius: 16px; padding: 18px; box-shadow: 0 4px 18px rgb(55 48 37 / 6%); }
  .card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .card__head p { margin: 0; }
  .status { flex: 0 0 auto; border-radius: 999px; padding: 6px 10px; background: #ece9e1; color: #52606d; font-size: .8rem; }
  .status--ok { background: #dff7e8; color: #047857; }
  .account { color: #1f2933 !important; font-weight: 650; margin-bottom: 4px; }
  .verified { font-size: .85rem; margin: 4px 0 0; }
  .blocked { background: #fff7d6; border-radius: 10px; padding: 10px 12px; color: #6b5315 !important; }
  .notice { border-radius: 12px; padding: 12px 14px; background: #e8f4ff; color: #17466e; }
  ol.steps { font-size: 1.15rem; line-height: 1.7; padding-left: 1.4rem; }
  .button { display: inline-block; font: inherit; font-weight: 650; padding: 11px 16px; border-radius: 10px; border: 0; background: #1d4ed8; color: #fff; cursor: pointer; text-decoration: none; }
  .button:active { background: #1e40af; }
  .button:disabled { cursor: wait; opacity: .65; }
  .button:focus-visible, input:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
  #done { display: none; font-size: 1.1rem; color: #047857; margin-left: 12px; }
  textarea { width: 100%; height: 260px; margin-top: 16px; font-family: ui-monospace, monospace; font-size: 0.78rem; border-radius: 8px; border: 1px solid #cbd5e1; padding: 12px; box-sizing: border-box; }
  form { display: grid; gap: 10px; max-width: 520px; }
  input { min-height: 44px; box-sizing: border-box; border: 1px solid #9aa5b1; border-radius: 9px; padding: 9px 11px; font: inherit; }
  .hint { color: #52606d; font-size: 0.95rem; }
  .ai { margin-top: 34px; border-top: 1px solid #d9d4c8; padding-top: 20px; }
  @media (max-width: 580px) { body { padding: 16px; } .card__head { display: block; } .status { display: inline-block; margin-top: 12px; } .button { width: 100%; box-sizing: border-box; text-align: center; } }
</style>
</head>
<body>
<main>
  <h1>Подключения MS Realty</h1>
  <p class="intro">Один экран для каналов агентства. Зелёный статус появляется только после ответа самого провайдера.</p>
  ${result ? `<p class="notice" role="status">${escapeHtml(result)}</p>` : ""}
  <div class="grid">
    ${connectionCard({ provider: "google", title: "Gmail + Google Calendar", description: "Отправка одобренных писем и календарь просмотров.", connection: google, action: googleAction })}
    ${connectionCard({ provider: "whatsapp", title: "WhatsApp Business", description: "Официальный WhatsApp Business Platform через Meta Embedded Signup.", connection: whatsapp, action: whatsappAction })}
    ${connectionCard({ provider: "viber", title: "Viber Bot", description: "Коммерческий бот Viber с проверенным webhook.", connection: viber, action: viberAction })}
  </div>
  ${
    token
      ? `<section class="ai">
         <h2>Подключить ИИ-помощника</h2>
         <ol class="steps">
           <li>Скопируй текст.</li><li>Открой Claude или ChatGPT.</li><li>Вставь и отправь.</li>
         </ol>
         <p><button class="button" id="copy" type="button">Скопировать текст для помощника</button><span id="done" role="status" aria-live="polite" aria-atomic="true">Скопировано ✓</span></p>
         <label class="hint" for="prompt">Текст подключения для ИИ-помощника</label>
         <textarea id="prompt" readonly spellcheck="false">${escapeHtml(prompt)}</textarea>
         <p class="hint">Текст содержит личный ключ оператора — не пересылай его. Аккаунт: ${escapeHtml(operatorId || "operator")}.</p>
       </section>`
      : '<p class="hint">MCP-ключи не показываются в браузерной сессии. Для них используются отдельные именованные credentials.</p>'
  }
</main>
<script>
  const copy = document.getElementById("copy");
  if (copy) copy.addEventListener("click", async () => {
    const area = document.getElementById("prompt"); area.select();
    try { await navigator.clipboard.writeText(area.value); } catch { document.execCommand("copy"); }
    document.getElementById("done").style.display = "inline";
  });
  const meta = ${inlineJson({
    enabled: Boolean(availability.whatsapp?.ready && !whatsapp),
    appId: availability.whatsapp?.app_id || null,
    configId: availability.whatsapp?.config_id || null,
    version: availability.whatsapp?.graph_version || null,
  })};
  if (meta.enabled) {
    let signup = null, code = null;
    const result = document.getElementById("whatsapp-result");
    const button = document.getElementById("whatsapp-connect");
    const fail = (message) => { result.textContent = message; result.removeAttribute("aria-busy"); button.disabled = false; };
    const finish = async () => {
      if (!signup || !code) return;
      button.disabled = true; result.setAttribute("aria-busy", "true");
      result.textContent = "Проверяю аккаунт Meta…";
      try {
        const response = await fetch("/api/admin/connections", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "whatsapp", code, waba_id: signup.waba_id, phone_number_id: signup.phone_number_id }),
        });
        if (response.ok) location.assign("/admin/connect?connected=whatsapp");
        else fail("Meta не подтвердила подключение. Проверь App Review и права приложения.");
      } catch { fail("Не удалось связаться с сервером. Повтори подключение."); }
    };
    addEventListener("message", (event) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let data = event.data; try { if (typeof data === "string") data = JSON.parse(data); } catch { return; }
      if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") { signup = data.data; finish(); }
    });
    window.fbAsyncInit = () => { FB.init({ appId: meta.appId, autoLogAppEvents: true, xfbml: false, version: meta.version }); button.disabled = false; result.textContent = "Готово к безопасному переходу в Meta."; };
    const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => fail("Meta SDK не загрузился. Проверь блокировщик и повтори."); document.head.append(script);
    button?.addEventListener("click", () => {
      if (!window.FB) return fail("Meta SDK ещё не готов. Подожди и повтори.");
      button.disabled = true; result.textContent = "Открываю Meta…";
      FB.login((response) => {
        code = response?.authResponse?.code || null;
        if (!code) return fail("Подключение отменено или Meta не вернула код.");
        finish();
      }, { config_id: meta.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
    });
  }
</script>
</body>
</html>`;
}
