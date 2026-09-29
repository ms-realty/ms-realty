# Hermes bounded assistance

The durable `ai.draft` job uses one bounded generation request and, when qualified, one typed
assessment request. Neither receives provider tools. There are no
application retries and `store: false`. Operator configuration keeps generation disabled by
default. The requested router/model, routing policy, prompt/schema versions, source digest, token ceiling and rates
are pinned to each request; a changed source, authority, configuration or UTC budget period
invalidates processing. Unknown provider cost keeps its reservation. Stalled running work
has no automatic provider retry.

- `case.assist`: the stored inquiry-summary, reply and next-action variants use an explicitly
  reviewed, minimized inquiry. This is a bounded inquiry context; broader Case aggregation is
  not implied.
- `locale.draft`: one target language from an exactly approved BG ListingRevision, current
  factual/editorial decisions and protected source facts. Numbers, references, URLs and source
  quotes are checked; human language qualification is still required. Accepted proposals do
  not create LocalizedRevisions or make translations indexable.
- `intake.extract`: an explicitly selected immutable PropertyFactRevision broker note. Known
  contact patterns are position-preserving redactions. Every proposed typed numeric value,
  unit/basis and conflict has exact note spans. Unknown values stay unknown; source class
  remains `broker_note`. PDF/document extraction, compliance and identity records are excluded.

Request and review actions reauthorize against the live source. Source snapshots are private
to actors with current source and drafting permission; report readers receive aggregates,
safe job metadata and actual worker-progress state only. Acceptance records an attributable
human review. It never writes property facts, posts/sends messages, creates tasks, grants
access, approves claims or publishes. Manual source/inventory/translation workbenches remain
available with provider activation disabled.

OpenRouter is the default transport. Activation requires `HERMES_ENABLED=1`,
`HERMES_PROCESSING_APPROVED=1`, `OPENROUTER_API_KEY`, `HERMES_ROUTING_QUALIFIED=1`,
and valid JSON in `HERMES_ROUTING_POLICY`:

```json
{
  "router": "typesafe/jev-router",
  "models": ["example/qualified-fast", "example/qualified-reasoning"],
  "providers": ["example"],
  "guardrailRevision": "replace-with-real-qualified-key-policy-reference",
  "sort": "price"
}
```

These are placeholders, not deployable model recommendations. Qualification means recorded
live evidence for this key, model pool, schemas, source classes and locales. The environment
flag attests that evidence; it does not create it or inspect account settings.

Jev Router chooses the underlying model and reasoning effort. Its allowed model pool must be
enforced by an OpenRouter account/key guardrail **before** transmission. The returned model
check is additional output validation, not a substitute for that privacy boundary. Jev Router
does not receive undocumented `auto-router` plugin settings. An explicitly selected
`openrouter/auto` policy instead requires `costTier` and sends its documented `allowed_models`
and `cost_tier` plugin. There is no automatic switch between routers or to direct OpenAI.

Both use `provider.only`, `require_parameters`, `data_collection: deny`, ZDR and rate ceilings.
OpenRouter may attempt allowed provider fallbacks within a request. Qualification must cover
fallback behavior, reasoning-token limits, strict schema support, billing and the key budget.
An operator must verify that Jev Router honors these restrictions; the model page alone is
not sufficient evidence. Empty/unavailable allowed routes must not relax the policy.

Explicit `HERMES_INPUT_USD_MICROS_PER_TOKEN`, `HERMES_OUTPUT_USD_MICROS_PER_TOKEN` and
`HERMES_DAILY_LIMIT_USD_MICROS` remain mandatory. The first two are approved **upper bounds**
for reservation and endpoint selection, not a guessed price for every selected model.
One micro-USD per token equals one USD per million tokens (`provider.max_price`). Completed
OpenRouter runs account `usage.cost`, rounded up to micro-units; absent cost keeps the full
reservation and fails the draft. Over-reservation billing records the known charge and fails.
The local reservation is not proof of a hard upstream spending cap; enforce the key cap too.
Bounded routing metadata records the actual model, provider when reported, generation ID,
policy digest and attempts. Cache hits may omit router metadata. Raw metadata, reasoning and
provider error bodies are not persisted.

The legacy Responses adapter requires explicit `HERMES_PROVIDER=openai`, `OPENAI_API_KEY`
and `HERMES_MODEL`. It is not a fallback. Existing internal injected test configurations without
a provider field preserve their legacy behavior; environment configuration defaults to OpenRouter.

Tests use synthetic sources and in-process generators or mocked transport. They establish
contract/authority/recovery behavior, not live model quality, cost qualification, procurement
approval or release readiness. A real model/prompt/locale change requires its separate live
evaluation and release evidence.

## Typed Jev assessment

`HERMES_JEV_ENABLED=1` requests semantic assessment after deterministic draft validation,
for inquiry, translation and broker-note extraction proposals. It additionally requires
`HERMES_JEV_QUALIFIED=1` and valid `HERMES_JEV_POLICY` JSON. Requested but unqualified
assessment disables generation as well; it is never silently omitted.

```json
{
  "model": "typesafe/jev-1.13",
  "snapshots": ["typesafe/jev-1.13-20260917"],
  "guardrailRevision": "replace-with-live-decision-qualification-reference",
  "inputCostMicros": 0.05,
  "outputCostMicros": 0,
  "maxCostMicros": 5000
}
```

This illustrates the contract, not an approved rate card or authorization to activate it.
The same restricted OpenRouter key must allow the qualified Jev snapshot and TypeSafe provider
in addition to the generative pool. Verify Decisions API privacy and provider constraints
separately. The decision request allows only TypeSafe, denies collection, requires ZDR and
has no provider fallback. It sends no trace, user identifier, tools or generative messages.

One batch asks independent Choice (source support), Noul (following untrusted instructions)
and Score (task usefulness) questions over minimized source plus the validated proposal.
Question text and policy are pinned by digest. State and questions together are capped at
24k UTF-8 bytes. The reservation allows three 32k input contexts and three 1024-token output
bounds at the approved rates; the configured `maxCostMicros` must cover them. Actual returned
billing, not a token estimate, determines the successful second-call charge.

The worker reserves both calls before queueing, rechecks source authority/freshness before
the second call and again before saving. An uncertain assessment remains a draft requiring
human review. It never sends, publishes, approves claims or changes a record. Source support
and assessment details appear before the review form in BG/RU/EN, including native JS-off pages.
Probabilities and score/confidence are model estimates, not calibrated correctness or access
rights; no arbitrary threshold grants approval.

If the second call's outcome is unknown, `actualCostMicros` remains null and the whole joint
reservation remains charged to the application budget. The known generation cost remains
in private validation evidence. A complete two-call result sums both actual costs. Malformed
answers, an unqualified snapshot, changed policy or excess cost fail the draft without retry.
Generation token columns describe the generation call; assessment token usage is separate in
its validation record. No live performance or accuracy is implied by synthetic fixtures.

See [OpenRouter/Jev research](../../../docs/research/openrouter-jev.md) for other applications
and remaining live qualification work.
