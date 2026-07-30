# Hermes × Desktop AI apps

The MS Realty platform accepts drafting work from the operator's desktop AI
apps. Two complementary modes exist; both feed the same review-gated pipeline
and never publish anything on their own.

## Pull mode — the desktop app connects as a plugin (MCP)

`production/scripts/hermes-mcp-server.mjs` is a zero-dependency MCP server
(stdio). The desktop app pulls tasks, generates drafts with **its own model on
the operator's subscription**, and submits them back for validation. No API
key, no per-token spend, no model call inside the platform.

| Tool | Purpose |
| --- | --- |
| `hermes_kinds` | What work exists + pending counts |
| `hermes_task` | Next task(s): canonical prompt + strict output contract |
| `hermes_validate_draft` | Validate against the real content rules; persist into the review queue |
| `hermes_status` | Backend switch state, queue depth, safety profile |

A drafted task lands as `hermes_drafted`, `public_indexable: false`,
`requires_human_approval: true`, and is reviewed at `/admin/translations`.
Every submission writes a `hermes_model_call` audit row with
`provider: desktop-mcp` and the connecting client's name/version.

### Where it is registered

- **Claude Code** — [.mcp.json](.mcp.json) in the repo root (project scope,
  picked up automatically).
- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`,
  server name `ms-realty-hermes` (registered alongside the Tempora `hermes`
  server; a timestamped backup of the previous config sits next to it).
- **Codex CLI** — `codex mcp add ms-realty-hermes -- node /Users/ivan/Code/MS-Realty/production/scripts/hermes-mcp-server.mjs`
  (already run; `codex mcp list` shows it).
- **ChatGPT desktop** — the app configures connectors from its own UI, not
  from files. Settings → Connectors (or Plugins → Create with plugin-creator)
  → add a custom MCP connector. If your build only accepts URL-based (remote)
  connectors, bridge the stdio server locally:
  `npx mcp-proxy --port 8931 -- node production/scripts/hermes-mcp-server.mjs`
  and point the connector at `http://127.0.0.1:8931`. Command-based (stdio)
  plugin support varies by ChatGPT build — use whichever the Plugins screen
  offers.

Manual run for debugging: `npm run hermes:mcp` (protocol on stdout, logs on
stderr).

### Typical desktop session

```
> use ms-realty-hermes: what's pending?
  hermes_kinds -> translation_draft, 658 pending
> pull one task and draft it
  hermes_task -> prompt + contract; the desktop model writes the draft
  hermes_validate_draft -> VALIDATION_FAILED: ... (fix and retry)
  hermes_validate_draft -> persisted, review at /admin/translations
```

## Push mode — the platform's worker uses desktop CLIs

`npm run hermes:worker` generates drafts server-side. Which engine it uses is
a switch, persisted in `production/data/hermes-backend.json` (gitignored,
machine-local):

```bash
npm run hermes:backend                  # show current backend
npm run hermes:backend set claude-cli   # or codex-cli | openrouter
```

| Backend | What runs | Cost | Where |
| --- | --- | --- | --- |
| `openrouter` (default) | OpenAI-compatible HTTP call | per-token | anywhere |
| `claude-cli` | `claude -p … --output-format json` | Claude subscription | dev machine only |
| `codex-cli` | `codex exec … --output-last-message` | ChatGPT/Codex subscription | dev machine only |

CLI backends **fail closed in production** (`NODE_ENV=production`): queued
drafts stay queued rather than silently billing the paid API. Switching is
audit-logged (`hermes_backend_switch`).

## What is deliberately NOT connected

Lead-reply drafting carries PII. It keeps its own stricter gate —
`self_hosted` provider mode only, enforced in `production/lib/lead-replies.mjs`
— and is not exposed over MCP and not affected by the backend switch. Desktop
CLIs and OpenRouter are both hosted inference, so neither qualifies.

## Env overrides (tests, sandboxes)

- `MS_REALTY_TRANSLATION_LEDGER_PATH` — where drafts persist
- `MS_REALTY_HERMES_AUDIT_PATH` — translation audit mirror
- `MS_REALTY_AUDIT_LOG_PATH` — admin audit log
- `HERMES_BACKEND` — backend when no state file exists (file wins over env)
- `HERMES_CLI_MODEL`, `HERMES_CLI_TIMEOUT_MS` — CLI provider tuning
