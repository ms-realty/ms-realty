# Guarded production routing adapter

`scripts/production-cutover.mjs` implements read-only snapshots and signed-plan Worker route apply/restore. No workflow invokes it. It cannot build or deploy an image, run a shell command, execute SQL, change DNS/SSL, provision a resource, generate checker evidence or sign an approval. The inactive promotion workflow remains held.

Current source remains a protected partial preview. Its incomplete baseline and exclusions cannot pass `promotionGate`; repairing this adapter does not qualify a release.

## Read-only observations

The MS Realty account is `921d0224dcd595c87b7928d2b3c479d1`; the observed COM zone is `f0ac7af0721419e8129e5d10ff547372`. The available read token permits account resource reads and COM zone reads. It cannot establish RU zone ownership. The actual COM inventory has 21 routes: three staging routes and 18 public null-script bypass routes, including whole-host, root and locale-prefix patterns. Every overlapping bypass must appear by its exact existing ID in a reviewed cutover plan; broad apex routes alone are insufficient.

The original COM A record remains `80445b86dbd30e00238697e7be909ac0`, address `185.80.2.102`, proxied, TTL 1. The WWW CNAME remains `be450dc427bddd5e282d17f28ecace11`, targeting the apex. The adapter snapshots every DNS record, including mail, and SSL mode; it has no DNS/SSL write endpoint. A complete cutover additionally requires an actual active, strict-TLS RU zone belonging to the reviewed account and working public RU routing/TLS. Neither is inferred from direct-origin access.

The rollback origin probe connects directly to `185.80.2.102:443`, sends the exact COM or RU Host/SNI, verifies the certificate with the normal trust store and requires HTTP 200/nonempty bytes. It never follows redirects, disables certificate checks or treats public DNS as independent origin evidence. This probe establishes source-origin reachability only.

## Signed inputs

The bundle is a local JSON path index. Its keys are `plan`, `baseline`, `report`, `expected`, `approvals.owner`, `approvals.controller`, `artifacts` and `recheck`. Paths resolve relative to the bundle. `recheck` points to an independently written signed production envelope; no checker command or executable path is accepted.

`report`, `expected` and the two approvals must first satisfy the unchanged `scripts/launch-gate.mjs` complete-parity contract. The two distinct trusted Ed25519 public keys come from `LAUNCH_OWNER_PUBLIC_KEY` and `LAUNCH_CONTROLLER_PUBLIC_KEY`. Each genuine approval must additionally contain `cutoverPlanSha256`, equal to the SHA-256 of the exact plan bytes. Existing signatures cannot be copied onto changed plan bytes or treated as new reviewer decisions.

The production plan requires these exact fields:

- `schemaVersion: 1`, `environment: production`, `purpose: complete_parity`, a UUID `operationId`, the fixed account, exact `sourceCommit`, accepted `digest` and full Cloudflare registry `image` ending in that same digest. The adapter never substitutes a tag or rebuilds.
- A dedicated `workerName` equal to `ms-realty-production-` plus the first 12 source characters; exact UUID `gatewayVersionId` and `gatewayDeploymentId`. This separates the candidate from the retained legacy Worker. Actual provider deployment and all three role images/rollouts/actor identities are read independently before and after checking.
- `baselineSha256`, the exact immutable snapshot bytes. Both actual source zones must be present with distinct IDs, account ownership, active status and strict SSL. No guessed RU ID is supplied by this implementation.
- `routes`, an explicit list of `{zoneId, pattern, baselineRouteId}`. Existing patterns must use their exact previous IDs. New patterns are limited to the whole-host pattern of a required production host. Required hosts are COM/RU apex and WWW, `my.makler-realty.com` and `app.makler-realty.com`. Every overlapping previous pattern, including null-script and more-specific bypasses, must be explicitly included.
- `timeoutSeconds: 600`, `rollbackTimeoutSeconds: 120`, `databasePolicy: preserve-current` and `dnsPolicy: preserve-all`.
- `artifacts`, exactly eight SHA-256 values named `gateway`, `inputs`, `routes`, `media`, `runtime`, `database`, `ownership` and `recovery`. The bundle supplies the corresponding exact bytes. Route/media hashes must equal the independently accepted staging pins. Gateway version identity and artifact custody remain an independent controller obligation; a configured hash does not prove provider deployment.

The pinned artifact contracts are executable checks in `validateProductionCutover`:

- `inputs` binds production Containers, account, candidate Worker, source/image, the three actual product origins, existing production media/cache buckets and a separate reviewed PostgreSQL 16.14 database with distinct web/worker/migrator roles and schema hash. It contains references and configuration, never credential values.
- `runtime` uses the existing three-role immutable source/build-nonce/actor identity shape. Web and queue must be running and migration completed. The actual Cloudflare application/rollout/instance observer verifies these actors against the same accepted image. An environment digest label is insufficient.
- `database` is a fresh production measurement bound to source/image, reviewed host/schema, exact migration operation/build nonce and both deployed SQL drivers for every role. Each driver must report the actual database, role, engine, verified TLS version and cipher. An explicit expand/contract compatibility receipt must preserve accepted writes and compatibility with rollback code. The routing adapter does not collect or manufacture SQL measurements.
- `ownership` is a fresh production observation bound to operation/source/image. It requires a real exclusive route lease covering both zones through checking/restoration, an exact active intake owner, disabled legacy consequential workers, an accepted-write ledger hash and a recovery-point identity. A source file or local test cannot establish this ownership transition.
- `recovery` binds that recovery point, retained untouched WordPress, recovery evidence and an independently armed watchdog bound to operation/baseline with a validity interval covering checking/restoration. Existing private custody files may satisfy requirements after their actual authority and bindings are verified. This adapter does not create watchdog service evidence or turn an asserted flag into runtime proof.

## Apply, independent checking and restoration

Before the first write the adapter verifies signatures/artifacts, writes and fsyncs a private journal, re-reads the full provider baseline, probes both independent original origins, reads the actual latest gateway deployment and observes all three role images. Before each route mutation it retains a durable intent. Each acknowledged update/create is read back against the exact expected route set. Full DNS/SSL/route state is checked before independent checking and again before acceptance.

The independent production envelope must be controller-signed and observed after this cutover starts, before its timeout. It must cover all six hosts, complete current delta, zero exclusions and all nine live gates with evidence hashes. Its `bindings` must exactly contain operation ID, plan/baseline/applied-state hashes, source/digest, gateway version/deployment IDs and all eight artifact hashes. It must use the accepted independent checker baseline. A staging report, health check, caller status label or a signed envelope for another operation cannot qualify.

Failure, an invalid checker envelope, timeout or SIGINT/SIGTERM invokes restoration with a new bounded signal. Existing route IDs regain their exact previous patterns/scripts, including script omission for the API's null-script bypass behavior. Candidate-created routes are deleted only when their ID/pattern/dedicated script and journaled intent match. A lost create acknowledgement is reconciled by exact pattern and dedicated script under the independently evidenced exclusive lease. Foreign bindings are preserved and reported as requiring reconciliation. Restoration attempts continue across individual route or journal-storage failures. Success requires exact full baseline readback and both strict origin probes. No database snapshot is restored and no accepted write is discarded.

Cloudflare route writes are not an atomic multi-route transaction and expose no conditional compare-and-swap contract here. The required exclusive lease and independent watchdog are therefore operational prerequisites, not optional flags. Process death, runner loss, forced termination or a late provider write cannot be made safe by a local `finally` block alone. Until the actual external watchdog, its durable journal custody and crash/late-write drill are qualified, this source is not a complete automatic production rollback system. The active promotion hold stays in place.

## Commands and boundaries

Create a private output directory first. The journal parent must have mode 700; journal files use mode 600, atomic initial creation/replacement and file/directory fsync. Credentials remain environment-only. Use a read-only token for snapshots and an independently reviewed narrow route-write token only in the eventual controlled production operation.

```sh
mise exec node@24.16.0 -- node scripts/production-cutover.mjs snapshot /private/exact-zones.json /private/baseline.json
mise exec node@24.16.0 -- node --test scripts/production-cutover.test.mjs
```

The `apply` and `restore` subcommands accept a bundle path and private journal path. They are not invoked by this preparation or any active workflow. Local tests use ephemeral test keys and injected provider/SQL records labeled as unit fixtures; no fixture is a live PASS, real approval, account observation or watchdog drill.

The provider transport uses the official [route list](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/list/), [route create](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/create/) and [route replacement](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/update/) APIs. Actual deployment identity uses [Worker deployment history](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/). Same-image preparation must retain a [digest-pinned managed registry image](https://developers.cloudflare.com/containers/guides/image-management/).

## Separate production runtime preparation

`gateway/production.ts` and `gateway/production-runtime-env.ts` implement the production entry independently of the protected staging entry. The existing staging entry, Access/noindex policy and negative guards are retained. `src/db/production-transport.ts` and `production-connectivity.ts` require exact production host/name/least-privilege role, PostgreSQL 16.14 and verified TLS for both deployed drivers. The common DB dispatcher selects production only for the explicit matching environment markers; separate encrypted credential stores must supply their own reviewed role. No insecure direct fallback is added.

`scripts/runtime-entry.mjs` selects the proper probe and supervised companion while retaining fixed immutable image identity, private diagnostic ports, uncertainty and single-operation migration behavior. `scripts/build-runtime.mjs` includes both production bundles in the same image. The existing Dockerfile already copies that runtime entry and the complete bundle directory; no Dockerfile change is required. These changes must be included before the next protected staging qualification. They cannot be bolted onto an already accepted digest.

`scripts/production-config.mjs` requires the unchanged signed promotion gate, exact owner/controller `productionInputsSha256` approvals and pinned full route/media/ownership artifacts. It generates only the exact staff `app.makler-realty.com/__release/*` control path; public/client/source-host routing remains the separate signed cutover operation. All three Container classes reference the accepted registry digest without a rebuild. Secrets remain role-scoped and environment-only. The existing generated logical route/media module is reproduced byte-for-byte from the accepted artifacts; fixture modules cannot serve production.

Runtime diagnostics require the exact staff origin, validated Access assertion and control secret. Migration/activation/deactivation additionally require fresh controller-signed operation grants bound to source/image/config/schema/accepted-report/ownership. Migration and activation grants have a maximum validity interval of 600 seconds. A preauthorized deactivation grant may cover 900 seconds so a controller can close intake and request queue stop after the checking timeout and restoration window. Stop acknowledgement remains explicitly unqualified for drain completion; accepted writes/current database are preserved.

The production control Durable Object stores activation and uncertainty before consequential operations. Unknown activation cannot replay silently. Public intake is held until explicit activation; an approved web role can resume after idle sleep. Production public responses use ordinary gateway indexing/cache behavior. Only the release controls are universally noindex. Source/digest process labels remain unqualified until separate provider observation.

Customer delivery and AI default off. Actual controller-signed feature/email policy artifacts tied to ownership are required to enable them. Butler route/budget variables come from that reviewed non-secret policy; runtime encrypted-store credentials are separate and operator credentials are never forwarded. Production email uses the exact staff `/__release/email` path; the existing public-origin `/__staging/email` contract remains unchanged. Recipient bindings require explicit policy/receipt evidence and never accept a wildcard. This source does not establish actual delivery, attachment support, consent, AI spend approval or business acceptance.

The durable rollback controller, exclusive lease, private provisioning and actual crash/late-write rehearsals are independently implementable operational work. They are not inherently missing human setup. Actual public RU authority/TLS, source/data parity, live service measurements, independent checker custody and authentic listing/screens/publication decisions must still be established by their authorized owners. Existing private artifacts may satisfy some requirements after exact verification. No fixture, copied timestamp, signature possession or asserted flag supplies those facts; the promotion hold remains in place.
