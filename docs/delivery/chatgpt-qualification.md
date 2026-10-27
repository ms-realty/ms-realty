# ChatGPT whole-job qualification

This operator driver runs one synthetic buyer job through the persisted workspace pipeline.
Only model transport is injected: context authorization, PostgreSQL migrations, queue writes,
planner validation, tools, checkpoints, artifact revisions and ordinary commands use the real
application implementation. It does not establish broker quality or production readiness.

Run it only after the operator has resolved the recorded subscription allowance blocker.
An app-owned OAuth session and a visible model catalog do not establish available inference
allowance. `subscription_sharing_usage_limit_exceeded` pauses qualification; changing models
or providers to evade that limit is outside this procedure. No agent should open the protected
bootstrap directory or run the live command without the operator's explicit authorization.

## Operator entry point

The operator supplies the registration ID, absolute protected bootstrap directory, and the
saved catalog export from the existing app-owned connection. The catalog must contain the
exact requested slug. This is an explicit operator binding between the supplied catalog and
registration; catalog visibility is not proof that inference or the whole job works.

The bootstrap directory must already exist, belong to the current OS user, have no group or
other permissions and be a real directory. `FileChatGptStore` and `accessToken` load or refresh
only the explicitly selected registration. No Codex credentials, API key, paid fallback or
automatic model switch is available. Evidence cannot be read from or written inside the
bootstrap directory, and a previous output folder is never reused.

After the allowance blocker is resolved, the root operator can run:

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55449/postgres \
  node --conditions=react-server --import tsx scripts/generative-chatgpt-evaluate.ts \
  --live-subscription \
  --model gpt-6.1-sol \
  --registration "$MSR_CHATGPT_REGISTRATION" \
  --bootstrap-dir "$MSR_CHATGPT_BOOTSTRAP_DIR" \
  --catalog "$MSR_OBSERVED_MODEL_CATALOG" \
  --output output/chatgpt-qualification-operator-run \
  --max-steps 8 --max-calls 16 --max-tokens 120000 \
  --max-output-tokens 4096 --max-input-bytes 49152 \
  --timeout-ms 30000 --max-elapsed-ms 240000
```

Use a fresh output folder for every explicitly authorized run. Do not substitute another
database endpoint. The driver accepts only the task-owned PostgreSQL endpoint shown above,
creates a random `test_` database with the existing isolated helper, and drops that database
after exporting its readback. No shared or production data is read. An inherited external
fixture-storage directory is rejected.

This is an **operator bootstrap transport injection**. It deliberately does not select the
deployed PostgreSQL credential store or prove encryption, stable host binding, refresh custody,
Container configuration, authenticated browser use or the deployed worker. Those runtime
qualification gates remain separate and unverified by this driver.
The enabled workspace configuration is an isolated operator-test injection. It does not
persist activation flags or mark the deployed application/provider qualified.

## Bounded envelope

The default envelope is one job, at most two research runs, eight planner turns per run,
sixteen generation attempts, thirty-four sequential queue deliveries, 120000 aggregate
input/output tokens, 49152 bytes of planner input, 4096 observed output tokens per response,
30000 milliseconds per transport attempt and 240000 milliseconds for the job. Concurrency
is one. Read retries are disabled; a failed or unknown provider outcome is not retried.

The subscription preview does not support a provider-side `max_output_tokens` request field.
The output token setting is local stream-byte and terminal-usage containment. The driver
does not claim that it prevents the provider from consuming additional allowance before
an abort reaches the service. Call, step, input, aggregate-token and elapsed guards prevent
additional unbounded requests, and oversize/usage failures remain failures. Tokens omitted
by a provider error remain absent usage, never a measured zero.

Money is inapplicable: policy, reservations, observed costs, checkpoint costs and actual
costs remain `NULL`. That is distinct from an unknown inference outcome. Subscription
limits and entitlement failures are preserved with their safe provider code and recovery
state; no USD price, API rate or synthetic bill is introduced.

The CLI permits reviewed adjustments only within hard maxima: twelve steps per run,
twenty-four attempts, 240000 aggregate tokens, 8192 observed output tokens, 65536 input bytes,
60000 milliseconds per attempt and 600000 milliseconds per job. It never adds a third run
or parallel inference. These maxima are containment settings, not recommendations to retry
a blocked subscription.

## Job and evidence

The corpus reuses the existing buyer/Case/Brief and approved-listing fixtures. Fixture
approval/publication pointers are created only in the random database before the forbidden
effect baseline; no delivery worker or public endpoint is operated. All identities, contacts,
listings, messages and task context are synthetic. The model sees only the current minimized
authorized source projection. Two selected synthetic listings support a meaningful comparison
and derived price-per-area calculation; their acoustic and access unknowns remain explicit.

The model must investigate using application tools and request the missing quiet-versus-centre
priority. A separately labelled scripted person supplies the saved clarification/correction.
The next run must produce editable task and buyer-handoff artifacts. Existing schema,
source/fact and exact-citation guards run before any scripted materialization. The driver
independently reads completed tool checkpoints rather than treating a model's tool claim as
execution evidence.

The scripted person edits the task title, creates one ordinary owned verification task,
replays that same operation, and materializes a manual Brief handoff through ordinary guarded
commands. It creates no buyer Interest, client acknowledgement, send, booking, public delivery,
access change, price change or legal/tax approval. Scripted `reviewed: true` inputs are test
actions, not a real broker's acceptance or quality scores.

The driver compares counts **and full-record digests** of protected tables before and after
execution.

The fixed protected inventory also includes appointment participants/resources/history,
CMS editions, operating/service policies, privacy requests/exports/safety/registers,
agency terms/review-consent history, effort entries and legal/commission records. Each
report enumerates the actual table commitments. A missing table or unreadable snapshot
fails qualification. The source manifest binds all schema modules and migrations. A
synthetic database regression changes a policy commitment without changing its row count
and requires the full-record digest to change; it supplies no human policy approval.

It retains these private, redacted files with a SHA-256 artifact manifest:

- `report.json`: outcome, bounds, observed usage, safe failure, exact non-secret argv,
  redacted database environment, source hashes and protected-effect readback.
- `packet.json`: original goal, source snapshots, clarification/correction, artifact versions,
  persisted runs/checkpoints, ordinary scripted-person commands and receipt readbacks,
  resulting task, Case, Brief and manual handoff.
- `providerCalls.json`: the actual planner inputs and parsed model output before workspace
  validation, usage where supplied, input digests, per-attempt latency and safe failures.
- `rawWireResponses.json`: bounded response status/media type and raw SSE/body content, with
  source-byte SHA-256 and a truncation indicator. Request authorization headers are excluded.
- `artifact-manifest.json`: exact exported file digests.

Credential/account/session values are removed from exported text. Required source facts,
quotes and numeric values remain available unless they coincide with a redacted secret;
the original source/wire digests remain to expose that distinction. Raw wire capture is
diagnostic evidence, not a substitute for persisted validation or provider entitlement.

`completed_automated_checks` means this synthetic corpus reached its required resulting
records and automatic invariants. `failed_or_paused` retains the actual provider or harness
failure and all available partial state. It never creates replacement model output to finish
a job. The random database is archival after export, so unresolved provider outcomes require
operator reconciliation before any separate new qualification run.

Human factual quality, usefulness, experienced-broker comparison, commercial judgement,
blind scoring, usability, deployed custody and launch readiness remain pending. Use the
rubric and independent review procedure in
[`generative-process-evaluation.md`](generative-process-evaluation.md); never score the model
under test as the sole judge of its own work.

## Synthetic harness verification

The focused test file injects synthetic Responses/SSE only and labels every resulting report
`synthetic_transport`. It never loads the live bootstrap directory or calls a provider.
It tests CLI containment, catalog selection, redaction, a complete real-PostgreSQL job, a
subscription usage-limit failure and an interrupted/unknown response. It is separate from
the already integrated synthetic workspace regression suite.

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55449/postgres \
  node --conditions=react-server --import tsx --test \
  scripts/generative-chatgpt-evaluate.test.ts
```
