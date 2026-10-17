# F29 generative working process

The staff Butler workbench accepts a goal before a task type is known. It keeps the person's
goal, constraints, conversation, proposed decisions, questions, plan, source references and
editable work products together. Research can ask for clarification, use evidence, prepare
alternatives and continue after a correction. The five existing drafting workflows remain
available through their original routes.

The [canonical FigJam process](https://www.figma.com/board/dUh3qIj3lIc9PXBEQ5RvPf?node-id=94-6657)
and [seven-gap traceability](https://www.figma.com/board/dUh3qIj3lIc9PXBEQ5RvPf?node-id=94-6753)
connect the complete target journeys to the staff implementation and its separate qualification gates.

## Implemented seams

| Review gap | Implementation | Observable completion check |
| --- | --- | --- |
| Durable working session | Private `generative_sessions`, runs, checkpoints and artifact revisions; generation fencing on correction/cancellation | Reload/resume retains context; old workers cannot overwrite a correction |
| Authorized business context | Selected inquiry and Deal, current buyer requirements, scoped messages/commitments, approved BG listing manifests and CMS editions | Current grants, saved source lineage and source digests are checked before history readback, inference, saving and person commands; private contacts/restricted records stay excluded |
| Research and planning tools | Strict planner turns request search, read, approved-listing search/comparison, finite arithmetic or draft preparation | Persisted typed tool requests/results drive subsequent inference; unsupported actions and fabricated citations are rejected |
| Usable proposals | Editable task and buyer handoff versions with source evidence; ordinary person-invoked task creation and buyer Brief/Interest commands | Exactly one internal task or reviewed Brief/handoff, with a real operation receipt; suggestions require the existing candidate-review contract |
| Operation policy | Current Butler eligibility is connected to proposal review; model tools expose no business command, person commands retain their ordinary capability/precondition checks | No autonomous sends, bookings, publication, access changes, price/contract changes or legal approval; replay returns the original receipt |
| Execution budgets and recovery | Explicit step, total-token, input/output, elapsed, cost and read-retry limits; shared actor/daily reservation with existing drafts | Cancel/correction fences in-flight results; saved tools resume without repeated inference; unknown provider charges retain reservations and require acknowledgment |
| Whole-job evaluation | Real-PostgreSQL process corpus, positive/negative state assertions, source fingerprints, metrics and blind broker rubric | Offline harness fails on any failed/skipped required test; live quality and human usefulness retain separate qualification |

## Provider and tool contract

The new workflow uses the existing strict JSON transport with a separate planner schema.
Each response requests at most one application tool or ends at clarification/review. The
application executes the typed, permissioned read or draft-preparation operation and persists
its result before the next inference. No provider reasoning transcript, executable HTML,
arbitrary SQL, arbitrary URL fetch or native provider function authority is accepted.

Inventory comparisons use explicitly selected, currently approved inventory. Approved CMS
prose is the document-research source; identity, financial and compliance files are excluded.
External research has a distinct unverified provenance class, but an open-web retrieval
connector is not activated by this change. Missing evidence is a question or a manual task,
never an invented listing fact. Approved price, area, bedrooms, place, reference and source
URL are shown from deterministic typed fact cards. Generated artifact narratives refer to
those cards; they cannot remix the source digits into a new listing statement. Calculated
values keep a complete reproducible expression and separate derived-source label; they do
not become listing price authority. Exact prefixed owner requirements remain distinct from
property facts. A person's saved buyer requirements and preferences are reviewed inputs,
with an ordinary revision receipt; model-generated needs still require source evidence.
These inputs never alter the approved property fact cards. Unsupported edits return a
correctable, not-applied validation result while retaining entered text.
Syntactic, quote and numeric validation is not a semantic quality guarantee;
factual judgment and public language remain subject to review.

## Activation and limits

Existing provider, processing, routing, rate-card and daily-budget qualification still apply.
The new harness additionally requires `BUTLER_WORKSPACE_QUALIFIED=1` and an explicit positive
`BUTLER_WORKSPACE_MAX_COST_USD_MICROS` no larger than the daily ceiling. Default qualification
is off. Operators must qualify the exact selected route/model, broader source projection,
planner schema, tools, usage accounting and limits before real material is transmitted.
This implementation does not discover credentials, change the chosen model or force effort.

| Workspace setting suffix | Default | Bound |
| --- | --- | --- |
| `MAX_STEPS` | 8 | 1–24 inference turns |
| `MAX_TOTAL_TOKENS` | 100000 | 1024–2000000 input plus output tokens per run |
| `MAX_OUTPUT_TOKENS` | 4096 | 256–8192 per inference |
| `MAX_INPUT_BYTES` | 49152 | 1024–131072 UTF-8 bytes per inference |
| `TIMEOUT_MS` | 30000 | 1000–120000 per inference |
| `MAX_ELAPSED_MS` | 180000 | 1000–900000 per run, at least the call timeout |
| `READ_RETRIES` | 2 | 0–2 additional attempts for explicitly transient read-only failures |

Suffixes use the `BUTLER_WORKSPACE_` prefix. An absent Butler setting can use the matching
legacy Hermes prefix; an explicit invalid Butler value never falls back. Existing assistance
generation keeps its original one-request limits. New work does not silently route to a
different model or provider. Existing task-specific Jev assessment remains attached to its
original five draft types; broad workspace quality has its separate evaluation contract.

One inference or saved tool executes per queue job. The run is claimed before the provider
request. After the validated inference is saved, a separately queued read-only tool can be
recovered without repeating inference. Expired running claims expose the ordinary resume
form using server-derived recovery state; resuming the saved tool retains its original run
and updates the session state/version. Saved conversation, checkpoints and artifact ancestry
are reauthorized against their persisted source manifests before reuse or readback, including
when the source falls outside the current bounded context window. A crashed started
inference whose outcome is unknown is not automatically retried. Cancellation stops subsequent work; a request already in flight
can finish and remains accounted for. Positive and unknown charges are never replaced with
zero to make the budget appear available.

The staff workbench has native forms, BG/RU/EN copy, current source panels, explicit refresh,
retained edits, isolated live progress, Stop, and same-operation GET readback. Progress
reads never refresh or reset a person's unfinished form. Stop and corrections target the
observed generation: model progress alone cannot invalidate them, while a newer human
correction or run stays protected by the generation fence. Model decisions are proposed notes. A buyer handoff without
current individual candidate reviews saves requirements and a manual review handoff; it
does not invent a shortlist decision or client consent.

See [process evaluation](generative-process-evaluation.md) for the executable offline harness
and human-quality packet. Source/CI, exact-provider qualification, human usefulness, wider
zero-learning acceptance and live release evidence are distinct. Launch authority remains
unchanged; this feature grants no deployment or autonomous business authority.
