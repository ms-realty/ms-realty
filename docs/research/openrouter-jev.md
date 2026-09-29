# OpenRouter and Jev integration decision

Primary sources checked 29 September 2026. This document distinguishes documented behavior,
local contract implementation and unverified live behavior. No authenticated inference or
provider activation was performed for this research.

## Hosted routing first

[Jev Router](https://openrouter.ai/typesafe/jev-router), slug `typesafe/jev-router`, is the
hosted solution requested by the owner. OpenRouter describes per-request model and reasoning
effort selection balancing quality, latency and cost, adapting across a conversation. Its
advertised context window is one million tokens; this is not permission to send an entire CRM.
Use the minimized source already authorized for each Hermes task.

The page describes free router pricing, while the public model catalog reports sentinel
pricing `-1`. Do not infer that routed downstream generation is free. Account actual returned
usage and qualify billing. The pasted 237/423 versus 130 benchmark was not independently
located in a primary benchmark report during this research; it is not MS Realty acceptance.

[Auto Router](https://openrouter.ai/docs/guides/routing/routers/auto-router), `openrouter/auto`,
is separately documented as using recent market spend by task. Its plugin `auto-router`
supports allowed/excluded models and cost tiers. Those settings are not documented for
`typesafe/jev-router`. Wrong plugin IDs can be silently ignored. This application therefore
rejects a Jev policy containing `costTier`, rather than showing a control with no proven effect.
`openrouter/auto-beta` is a separate early-access route and is not enabled here.

[Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) are ordered error
recovery, distinct from per-request model selection. The application does not add a second
classifier to reproduce OpenRouter's hosted model routing and does not silently downgrade
between routing products.

## Controls and observable behavior

[Provider selection](https://openrouter.ai/docs/guides/routing/provider-selection) supplies
provider allowlists, parameter support requirements, privacy restrictions, ZDR, sorting and
price ceilings. A model publisher and the provider serving that model are different identities.
Sorting by latency/throughput is a preference, not an SLA. Provider fallback remains constrained
by the allowlist. A rate ceiling does not by itself bound total request tokens or account spend.

[Guardrails](https://openrouter.ai/docs/guides/features/guardrails) can constrain model/provider
access and budgets at the account/key level. Jev Router activation requires proof that the
actual key restrictions cover its selected backends. Detecting a disallowed model after its
response cannot undo data transmission. Keep the integration disabled until that pre-request
boundary is demonstrated; do not manufacture a Jev-specific allowlist parameter.

[Router metadata](https://openrouter.ai/docs/guides/features/router-metadata) is opt-in via
`X-OpenRouter-Metadata: enabled`. Retain only bounded route facts, not opaque pipeline data.
The response model is the selected model; the durable run separately keeps the requested router.
Metadata can be absent on cache hits. [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
provides actual billed cost. Missing billing is unknown, not zero. Strict JSON schemas still
require independent application validation and qualification across the approved pool.

## Jev as typed domain intelligence

[Jev on OpenRouter](https://openrouter.ai/docs/guides/community/jev) and its
[tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial) describe a separate model,
`typesafe/jev-1.13`, accessed through `POST /api/alpha/decisions`, or the TypeSafe SDK-compatible
`/api/v1/systemone`. This returns structured judgments, not ordinary generated prose:

- Choice selects a supplied candidate and returns confidence/probabilities.
- Noul estimates the probability of a supplied proposition.
- Score selects a rubric level with a distribution.

Questions can share one bounded state. Pin the model family/snapshot in evaluation evidence;
an unversioned latest alias can change behavior. OpenRouter's endpoint information reports
a dated Jev 1.13 backend and 32k context. Router context capacity does not transfer to this model.

TypeSafe's [use-case map](https://docs.typesafe.ai/concepts/use-case-map),
[primitives](https://docs.typesafe.ai/primitives),
[confidence guidance](https://docs.typesafe.ai/confidence) and
[model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) inform the following scope:

| MS Realty need | Suitable Jev judgment | Deterministic boundary |
| --- | --- | --- |
| Grounding a generated draft | Noul unsupported assertion; Choice supported/uncertain/conflicting | Exact source spans, protected facts and human approval remain mandatory |
| Search candidates | Score relevance against an explicit rubric | Retrieve only authorized published records first; do not let ranking grant access |
| Ambiguous note extraction | Choice among pre-parsed candidate values, including unknown | Arithmetic, units, dates and source-span validation stay in code |
| Duplicate candidates | Pairwise matching judgments | Human merge/split decision and reversible record operations |
| Inquiry/task triage | Choice from bounded purposes or queues; Score urgency | No autonomous assignment, promise, sending or permission change |
| Translation review | Separate rubric questions for meaning, terminology and unsupported claims | BG source authority and human indexing approval unchanged |

These domain applications are **planned, not implemented by the routing slice**. Give each a
separate schema, prompt/model version, input boundary and labeled BG/RU/EN/other-locale evaluation.
Probabilities are not ground truth and Noul is not generic confidence. Do not invent a universal
acceptance threshold. Evaluate abstention, multilingual performance, prompt injection, noisy
context and indirect wording. Arithmetic and exact legal/property facts remain outside semantic
authority. Never send compliance/identity documents merely because the model accepts text.

The official [Jev-verified cascade](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-verified-cascade)
shows generation followed by verification and escalation. For MS Realty, any added decision call
must reserve its own cost, preserve unknown partial-call charges, and retain human review. A
successful model judgment must not publish, send, grant access or approve a legal claim.

## Evidence still required

1. A synthetic live request through the intended restricted key: route, actual selected model,
   strict schema, reasoning/output accounting, billed cost and metadata.
2. Negative live checks for disallowed models/providers and empty eligible pool, including
   fallback behavior and ZDR policy. No customer data during qualification.
3. Labeled task/locale evaluations and documented acceptance thresholds before activation.
4. Typed Jev contracts and their own failure/cost/quality tests before claiming domain integration.

Local transport/queue tests can establish the application's contract, not any of these live facts.
R00 and the existing launch authorities remain unchanged.
