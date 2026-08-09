# Operator AI — run the whole agency from your own desktop AI

MS Realty's Hermes layer is a **framework, not a hosted model**: dispatch
queues, fact-preserving validation, draft-only contracts, PII gates, and
append-only audit. Any agentic desktop AI the operator already pays for
(Claude Desktop with Claude Code, ChatGPT with Codex) can supply the
intelligence, while the framework keeps every guardrail. No GPU hosting, no
per-token API bills, no new accounts.

## The one-step experience

1. The operator logs into the admin and opens **`/admin/connect`**.
2. The page shows three lines a child can follow and one button:
   **"Скопировать текст для помощника"** — the copied text is the full
   bootstrap prompt with the operator's own bearer token and this
   deployment's URL already substituted.
3. They paste it into Claude or ChatGPT. The AI configures itself (it has a
   terminal), verifies its access, and reports back in the user's language:
   what is connected, a numbered menu of things it can do, and what is
   intentionally off.

The prompt source lives in `production/lib/operator-connect.mjs`
(`operatorBootstrapPrompt`) and is served by both runtimes
(`http.mjs` and `app-admin-adapter.mjs` → `app/admin/connect/route.js`).

## What the AI connects to

| Surface | Transport | What it provides | Writes? |
|---|---|---|---|
| **Business MCP** `<origin>/mcp` | remote MCP (JSON-RPC over HTTPS), operator bearer token | launch status, public listing search, operator brief, broker work queue, listing content queue, translation queue | Read-only on Cloudflare: the Worker sets `MS_REALTY_MCP_WRITES_DISABLED=1`, so ledger-writing tools (`edit_listing_content`, `bulk_update_listing_status`, `save_translation_draft`, `queue_reviewed_reply`, `run_operator_workflow`) are not registered — the container disk is ephemeral and a lost draft is worse than no draft. They light up wherever the runtime has durable ledgers (local, compose). |
| **Hermes drafting bridge** `npm run hermes:mcp` | local stdio MCP (owner's machine with the repo) | `hermes_status`, `hermes_next_tasks` (the exact messages the hosted worker would send its model), `hermes_submit_draft` (validated, ledgered, audited, draft-only) | Yes — local repo ledgers, same append-only path as the hosted worker. Sensitive rows are refused by the provider gate (`sensitiveDataAllowed=false`). |
| **Gmail / Calendar** | the AI client's own connectors (Anthropic/OpenAI first-party) | sending human-approved replies, scheduling viewings | The human clicks "connect Gmail" once in their AI app's settings; the AI never gets our mail credentials — there is nothing to build or verify on our side. |

Edge wiring: `workers/durable-case-authority.mjs::allowsMcpRequest` admits
`POST/DELETE /mcp` through the mutation gate **only when
`MS_REALTY_PUBLIC_ORIGIN` is set** — that secret doubles as the deliberate
"MCP on" switch. The app still 401s anything without a valid operator token,
and browser calls are origin-allowlisted.

## Why Gmail is NOT an OAuth button in our admin

A server-side Google OAuth app needs a verified consent screen for
restricted scopes (weeks), durable token custody, and would end with the
system sending mail autonomously — which the draft-only contract forbids
anyway. The AI clients already ship maintained Gmail connectors behind one
click, and the human stays the sender. We inherit the integration instead of
owning it. Revisit only if a shared team mailbox with server-side send ever
becomes a real requirement.

## Guardrails (enforced by code, restated in the prompt)

- Draft-only: nothing the AI produces publishes, indexes, or reaches a
  customer without a human approving in the admin.
- `assertProviderMayReceiveDispatch` refuses sensitive dispatch rows
  (lead replies, raw contacts) to any non-self-hosted provider — the desktop
  bridge introduces itself as `desktop_subscription`.
- Fact preservation is validated on submit; drafts that drop price, area, or
  location are rejected with the reason.
- The MCP operator brief is the privacy-safe view (no raw contacts, no
  message bodies).

## Unlock ladder

| Phase | Unlock | Needs |
|---|---|---|
| now | read + analyze + local drafting bridge + client-connector Gmail | this PR + `MS_REALTY_PUBLIC_ORIGIN` secret |
| next | remote MCP write tools (drafts from any device) | ledger durability (Postgres/DO) — DEPLOYMENT.md §9.7 |
| later | OAuth/OIDC on `/mcp` so claude.ai web & ChatGPT connectors work without header beta | stand up the OIDC issuer already stubbed in `mcp-oidc.env.example` |
| launch | hosted self-hosted Hermes endpoint for the `live_services` gate — unattended batch drafting, sensitive-classification work | GPU box or provider, per SOURCE_OF_TRUTH §11 |

## Operational notes

- Rotate an operator's token = edit `MS_REALTY_ADMIN_CREDENTIALS_JSON` and
  re-copy the prompt from `/admin/connect`; old sessions die instantly.
- The connect page sends `cache-control: no-store` and `noindex`; the token
  it embeds is the same one the operator just authenticated with.
- The bridge writes to the real repo ledgers — run it on the machine that
  owns the checkout, commit/import through the normal review flows.
