# Operator AI — run the whole agency from your own desktop AI

MS Realty's Hermes layer is a **framework, not a hosted model**: dispatch
queues, fact-preserving validation, draft-only contracts, PII gates, and
append-only audit. Any agentic desktop AI the operator already pays for
(Claude Desktop with Claude Code, ChatGPT with Codex) can supply the
intelligence, while the framework keeps every guardrail. No GPU hosting, no
per-token API bills, no new accounts.

## The one-step experience

1. The operator logs into the admin and opens **`/admin/connect`**.
2. The page issues a short-lived delegated credential once, in a masked,
   no-store field, and provides separate copy controls for the credential and
   token-free client configuration.
3. The operator installs the branded MS Realty Operator plugin or adds the
   remote MCP connection, keeps the token in `MS_REALTY_OPERATOR_TOKEN`, and
   verifies access in their own client. The AI reports back in the user's language:
   what is connected, a numbered menu of things it can do, and what is
   intentionally off.

The prompt source lives in `production/lib/operator-connect.mjs`
(`operatorBootstrapPrompt`) and is served by both runtimes
(`http.mjs` and `app-admin-adapter.mjs` → `app/admin/connect/route.js`).

## What the AI connects to

| Surface | Transport | What it provides | Writes? |
|---|---|---|---|
| **Business MCP** `<origin>/mcp` | remote MCP (JSON-RPC over HTTPS), delegated operator bearer token | public discovery plus role-scoped reads through `ms_realty_admin_read` | Writes use only `ms_realty_admin_write` and `ms_realty_hermes`. Both require a one-use signed challenge bound to the operator, session, operation and exact input, then pass through the existing admin authorization and audit boundary. |
| **Hermes drafting bridge** `npm run hermes:mcp` | local stdio MCP (owner's machine with the repo) | `hermes_status`, `hermes_next_tasks` (the exact messages the hosted worker would send its model), `hermes_submit_draft` (validated, ledgered, audited, draft-only) | Yes — local repo ledgers, same append-only path as the hosted worker. Sensitive rows are refused by the provider gate (`sensitiveDataAllowed=false`). |
| **Google Workspace** | owner OAuth in `/admin/connect` | approved Gmail delivery and Google Calendar viewing sync | The owner connects once; encrypted refresh credentials stay in the durable provider store and delivery remains an explicit reviewed action. |

Edge wiring: `workers/durable-case-authority.mjs::allowsMcpRequest` admits
`POST/DELETE /mcp` through the mutation gate **only when
`MS_REALTY_PUBLIC_ORIGIN` is set** — that secret doubles as the deliberate
"MCP on" switch. The app still 401s anything without a valid operator token,
and browser calls are origin-allowlisted.

## Provider boundary

Google OAuth is an owner-admin connection because Gmail delivery and Calendar
sync have real application consumers. OpenRouter is a separate Hermes runtime
provider and is never a customer-message transport. Providers without an
implemented, audited consumer stay hidden instead of appearing as decorative
"connected" cards.

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
| now | read + analyze + guarded drafts + owner Google/WhatsApp connections | production origin, durable stores and provider credentials |
| now | remote MCP writes from an authorized client | delegated token plus a one-use signed operation challenge |
| later | OAuth/OIDC on `/mcp` so claude.ai web & ChatGPT connectors work without header beta | stand up the OIDC issuer already stubbed in `mcp-oidc.env.example` |
| launch | hosted self-hosted Hermes endpoint for the `live_services` gate — unattended batch drafting, sensitive-classification work | GPU box or provider, per SOURCE_OF_TRUTH §11 |

## Operational notes

- Revoke or replace delegated operator credentials through the owner connection
  flow; never store them in the copied configuration or repository.
- The connect page sends `cache-control: no-store` and `noindex`; it reveals a
  freshly issued credential once in a masked field separate from configuration.
- The bridge writes to the real repo ledgers — run it on the machine that
  owns the checkout, commit/import through the normal review flows.
