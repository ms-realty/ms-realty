# Hermes bounded assistance

The durable `ai.draft` job uses one bounded Responses API request, no provider tools, no
automatic retries and no storage flag. Operator configuration keeps generation disabled by
default. The selected model, prompt/schema versions, source digest, token ceiling and rates
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

Activation requires `HERMES_ENABLED=1`, `HERMES_PROCESSING_APPROVED=1`, `OPENAI_API_KEY`, an
operator-selected `HERMES_MODEL`, explicit `HERMES_INPUT_USD_MICROS_PER_TOKEN`,
`HERMES_OUTPUT_USD_MICROS_PER_TOKEN` and `HERMES_DAILY_LIMIT_USD_MICROS` (see `config.ts` for exact units).
Tests use synthetic sources and in-process generators or mocked transport. They establish
contract/authority/recovery behavior, not live model quality, cost qualification, procurement
approval or release readiness. A real model/prompt/locale change requires its separate live
evaluation and release evidence.
