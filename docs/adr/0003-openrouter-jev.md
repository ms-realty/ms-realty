# ADR 0003: hosted OpenRouter routing and typed Jev assessment

Date: 29 September 2026. Status: implementation decision following the owner's instruction to
use current OpenRouter routing and Jev, rather than configure one fixed generation model.
Live provider activation is not authorized or qualified by this decision.

This supersedes only D12's initial inference-provider choice in architecture §2/§12 and the
OpenAI-first statement in ADR 0002. Hermes remains a bounded, draft-only application module.

Use OpenRouter's hosted `typesafe/jev-router` for model and reasoning-effort selection under a
qualified multi-model policy. Keep one application adapter; do not add a home-grown classifier
to duplicate hosted routing. `openrouter/auto` is a distinct explicit policy option with its own
documented plugin settings. Legacy OpenAI Responses is available only by explicit configuration;
there is no automatic fallback to it when routing qualification is absent.

Use `typesafe/jev-1.13` separately for bounded typed judgments through the Decisions API.
The implemented assessment batches source grounding (Choice), following untrusted instructions
(Noul) and usefulness (Score). A dated response snapshot must match the qualified policy.
These estimates assist human review; they cannot approve facts, grants, publication, messages,
translations for indexing, or regulated conclusions.

Generation and assessment reserve a joint worst-case budget, retain actual costs separately,
and recheck source authority/version and policy pins. Unknown billing retains the reservation.
Request-level provider/privacy/price controls supplement a qualified restricted key; checking
the selected model after a response cannot enforce a pre-transmission model allowlist.

Activation requires an approved project secret, processing approval, budget, evaluated model
pool/snapshots and evidence that the actual key enforces the intended restrictions. Missing
qualification leaves manual workflows usable and model calls disabled. A million-token router
context does not widen the minimized data authorized for a task. Free router pricing does not
establish free downstream inference.

Primary-source references and documented limitations are in
[the routing research](../research/openrouter-jev.md). Local implementation/test evidence is in
[the routing review](../delivery/reviews/2026-09-29-openrouter.md) and
[the typed assessment review](../delivery/reviews/2026-09-29-jev-assessment.md).
R00, release gates and preserved launch authority are unchanged.
