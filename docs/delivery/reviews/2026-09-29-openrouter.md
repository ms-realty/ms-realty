# Hosted OpenRouter routing — local contract review

29 September 2026. Owner request: first find the OpenRouter solution for model/reasoning
routing, then integrate Jev appropriately. [Primary-source research](../../research/openrouter-jev.md)
identifies `typesafe/jev-router` as the hosted route and distinguishes typed Jev decisions.

Implemented: OpenRouter transport for all existing Hermes draft variants, strict output
schema, qualified multi-model policy, constrained provider fallback, privacy/price controls,
actual returned billing, bounded route metadata and byte-limited responses. Requested router
and selected backend remain separate. Jev controls reasoning effort. Policy changes invalidate
queued work before inference. Unknown billing retains the reservation; known excess billing
fails the draft. Human review and source reauthorization are unchanged.

`openrouter/auto` is an explicitly selected alternative with its documented plugin, not an
automatic fallback. Jev policies reject unsupported cost-tier settings. The old Responses
transport requires explicit operator selection. Environment defaults remain disabled.

Validation on native disposable PostgreSQL 18:

- `npx vitest run src/server/ai`: **195 passed, nine files**, including actual-cost accounting,
  route policy changes, unknown/excess billing, two different selected models, malformed output,
  refusals/tool calls, disabled/HTTP failure paths and byte limits. No live inference.
- `npx tsc --noEmit`, repository `npm run lint`, and `git diff --check`: passed.
- First test run exposed two incorrect test expectations: the durable worker records failure
  and then throws. Assertions now check both rejection and the retained database state.
  TypeScript additionally required explicit array-element presence checks; these were repaired.
- Logs retained under `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:
  `openrouter-tests-final.log`, `openrouter-types-final.log`, `openrouter-lint.log`.

No UI behavior changed, so this slice does not repeat browser screenshots. Full build/CI belongs
to its resulting commit. Predecessor `d801e831` passed every CI job in run `36592154469`.

This is an author review, not independent or live model qualification. The local Jev edit filter
initially mistook a source variable for a credential; the expression was simplified without
changing the filter. Remote Jev rule review reported `daily_budget_reached`, not a pass.

Open: authenticated synthetic qualification of Jev Router restrictions/schema/effort/billing,
key guardrail evidence, multilingual quality evaluation, and the separate typed Jev domain
judgment integration. A post-response model check cannot enforce pre-transmission privacy.
No provider activation, deployment, real customer data, messages or launch-gate changes occurred.
