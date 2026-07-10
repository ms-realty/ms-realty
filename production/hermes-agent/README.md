# Managed Hermes Agent Runtime

This directory defines the review-gated Hermes Agent used by MS Realty. It is
an internal drafting service, not a public chatbot gateway or a worker with
host access.

## Boundary

- The API is reachable only by the application through the Docker `hermes`
  network. It has no published host port.
- The profile disables every Hermes toolset, persistent memory, skills writes,
  browser access, terminal access, and messaging access.
- The service can draft a translation or broker reply, but cannot publish a
  page, make it indexable, or send a customer message.
- Customer and owner data stay on the configured self-hosted model endpoint.
  Do not set an external model aggregator as the upstream provider.

## Local Bring-Up

`npm run docker:hermes:up` creates the isolated agent service only after these
private values are present in `.env.local-production` or supplied as process
environment variables:

```dotenv
HERMES_AGENT_MODEL=your-self-hosted-model
HERMES_AGENT_LLM_BASE_URL=https://llm.internal.example/v1
HERMES_AGENT_LLM_API_KEY=replace-with-private-model-token
```

`HERMES_AGENT_API_SERVER_KEY` is generated locally when the env file is first
created. The command connects the application to the internal Hermes Agent API
at `http://hermes-agent:8642/v1/chat/completions`, then writes a local-only
runtime report after checking `/health` and `/v1/capabilities`.

The runtime proof verifies that the upstream is the official Hermes Agent API,
but it does not prove model inference. Run `npm run hermes:worker` after the
private model server is reachable to produce the review-gated draft-worker
evidence. A local report never clears a production launch gate.

## Production

Run Hermes Agent with a distinct data volume, a managed copy of `config.yaml`
and `SOUL.md`, an authenticated API server, and an internal model endpoint.
Set the MS Realty application's `HERMES_CHAT_COMPLETIONS_URL` to the Agent API
and `HERMES_API_KEY` to its API server key. Then run:

```bash
npm run live:provisioning
npm run live:provisioning:preflight
npm run live:capture
npm run live:preflight
```

`live:capture` makes a real draft-worker request. It remains blocked until the
search engines, Hermes Agent, and model server all respond successfully.
