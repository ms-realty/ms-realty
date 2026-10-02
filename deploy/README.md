# Cloudflare staging preparation and launch contract

This prepares reversible source and a guarded **staging-only** workflow. It is not a deployment,
delivery proof, independent parity PASS or production approval. The 1 October owner zero-loss
gate in `output/msr-launch/LAUNCH-GATE.md` supersedes historical URL dispositions. The current
launch-authority inputs in `production/data/` remain applicable; blocked gates remain blocked.
`app-spec.template.json` is retained as an inactive historical reference. DigitalOcean App
Platform and its former PostgreSQL 18 assumption are not the selected deployment contract.

## MS Realty account boundary

Owner correction, 2 October: all MS Realty operations use MS Realty identities and
credentials. GitHub writes authenticate as `ms-realty` against `ms-realty/ms-realty`.
Retrieve that account's keyring token explicitly with
`gh auth token --hostname github.com --user ms-realty` and pass it as `GH_TOKEN` only
to the intended command. Verify `gh api user --jq .login` returns `ms-realty` before
a write. Remove an inherited `GH_TOKEN`/`GITHUB_TOKEN` before the keyring lookup.
Git HTTPS writes also need an explicit per-command `gh auth git-credential` helper
using that token; the desktop's globally active login is not project authority.
Never fall back to another account when an MS Realty credential is unavailable.

GitHub Actions credentials and environment secrets belong to this repository.
Environment `staging` is restricted to branch `codex/msr-staging`; its credentials
must be fresh and staging-only. The earlier 403 reports came from a superseded
GitHub identity and are not evidence that `ms-realty` lacks access.

Cloudflare uses **Ms.realty.bg@gmail.com's Account**, account ID
`921d0224dcd595c87b7928d2b3c479d1`. Inventory, preflight and deployment must use
that exact account and its scoped credentials. A different account is rejected;
an unverified or missing MS Realty token blocks the operation. Database, R2,
Email, Access, AI/provider billing and any future connected services must remain
within the owner-approved MS Realty account boundary. This does not grant
production promotion or change the independent parity/signoff gate.

## Selected runtime and measured OpenNext blocker

The owner's first preference is **Next.js on Workers through OpenNext**. The #280 owner measured
OpenNext 1.20.7 build and Wrangler 4.143.0 dry-run PASS. Its pinned Sharp 0.35.4 import fails during
`createRequire` initialization in workerd and prevents the Worker from starting. The measurement
is recorded in `output/msr-launch/CLOUDFLARE-INVENTORY.md` and the owner qualification report at
`/Users/ivan/Code/.artifacts/ms-realty/recovery/20261001/cloudflare-contract/opennext-qualification.json`.
The affected native media/document and derivative paths require those protections. This concrete
failure meets the owner's stated fallback exception: **Containers is selected for the current
complete candidate**, with web, queue and migration sharing one digest. A later OpenNext split
requires separately qualified image processing. The official [OpenNext support matrix](https://opennext.js.org/cloudflare)
supports Next.js 16 but lists Node Middleware as unsupported. This application's Next 16 proxy
uses `node:crypto` timing-safe comparisons and `node:net` for origin security. Experimental
adapter support needs actual build/preview and host, nonce/CSP, origin, session and streaming
qualification. The experimental proxy and PostgreSQL tracing are not the measured fallback reason.

The queue entry is a persistent Node `pg-boss` worker. Workers' bounded [execution limits](https://developers.cloudflare.com/workers/platform/limits/)
do not by themselves replace that lifecycle. A hybrid OpenNext web + Containers queue/migrator
requires an explicit artifact/provenance contract: an OpenNext bundle is not the same OCI image.
PostgreSQL itself is not an OpenNext blocker: [Hyperdrive supports PostgreSQL drivers](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/).
No Hyperdrive configuration currently exists in the recorded account inventory.

`gateway/cloudflare.ts` implements the selected **Containers staging adapter**, with its own
`wrangler.containers.types.jsonc` and strict `gateway/tsconfig.json`. It does not replace
`gateway/wrangler.jsonc` or an OpenNext entry. `STAGING` is exactly `true` or `false`; `1`, `TRUE`
and other strings fail closed. The other owner's `STAGING=1` convention must be reconciled.
The staging workflow requires the controller's explicit reviewed mode. It currently refuses
OpenNext until the coordinated artifact contract is integrated; there is no automatic fallback.

## One immutable Containers image

Build `Dockerfile` once from the exact qualified source descendant of #280 base
`e23d17b1ce71fce694e823643ea94a7440dd4912`, with `BUILD_SHA=<full commit>`. The existing Dockerfile
pins Node 24 Debian, bundles standalone Next, queue and migration against the same locked
dependency tree, and runs as the unprivileged `node` user.

| Role | Command | Database credentials |
| --- | --- | --- |
| Web | `node server.js` | staging web role only |
| Queue | `node --conditions=react-server dist-runtime/worker.mjs` | staging worker role only |
| Migration | `node --conditions=react-server dist-runtime/migrate.mjs` | staging migrator role only |

The deploy configuration references `registry.cloudflare.com/<account>/<repository>@sha256:D`
for all three classes. [Cloudflare image management](https://developers.cloudflare.com/containers/guides/image-management/)
permits prebuilt digest references. `staging-image.mjs` reads the actual pushed Docker RepoDigest,
checks platform and OCI revision, and records Dockerfile/dependency/artifact pins. GitHub attests
that immutable subject. No production promotion may rebuild or substitute a tag. The signed
controller acceptance must pin that provenance and the exact route/media/input artifacts.

Migration persists a source/build-nonce/operation receipt before starting and uses the existing
database advisory lock. Only explicit process completion matching all three identities produces
a completed receipt. A Container stop, including SDK-synthesized exit 0, is not completion proof.
The configured image digest remains labelled unqualified until separate provider observation
verifies the actual three image/rollout/actor identities. Running, failed or unknown operations
require operator reconciliation; they are not blindly replayed. Queue/web start only after that
migration completes. Queue activity is renewed and a scheduled event restarts it
after an exit. Real dequeued heartbeat, crash recovery, delivery and capacity remain qualification
work; startup or `/api/health` proves less. Bootstrap is a separate reviewed operation.

## Required isolated inputs and current holds

Copy `cloudflare-staging.inputs.example.json` to the operator-owned
`cloudflare-staging.inputs.json`, then supply reviewed nonsecret inputs. Nulls, unknown IDs,
missing artifacts and placeholders fail validation. Never use `PRODUCTION_ENV_FILE`.
An explicitly authorized `purpose: protected_partial_preview` may use the pinned partial
staging map and manifest only with `scope: staging_only`, `productionAllowed: false` and exact
manifest/exclusions SHA-256. Its exclusions remain visible and it cannot pass the promotion
validator. The current map has 591 identities and 549 explicit exclusions; it is not complete
baseline or fresh-delta parity. Full coverage with zero exclusions remains a hard promotion gate.
For Actions install that reviewed nonsecret JSON in the staging environment's `STAGING_INPUTS_JSON`
variable with `sourceCommit: null`. Only after the exact qualified-SHA guard succeeds does
`staging-inputs.mjs` bind it to the checkout and validate it. This avoids a Git commit needing to
contain its own hash; an existing different source pin is rejected.

- Account is `921d0224dcd595c87b7928d2b3c479d1`. The three hosts are `staging.makler-realty.com`,
  `my.staging.makler-realty.com`, and `app.staging.makler-realty.com`. Existing proxied DNS and
  verified Access are prerequisites; these scripts do not create DNS.
- Fresh inventory records no configured Zero Trust Access. Supply the actual application,
  audience, team, owner, reviewed controller identities/group and named service token. The
  read-only preflight checks all three hosts and denies bypass/everyone/foreign members and
  conflicting more-specific applications. Route inventory also rejects more-specific Worker routes,
  wildcard overlaps and no-script bypasses on any staging host. Unknown policy/route shapes
  require review; the preflight does not mutate existing routes.
- Actual legacy PostgreSQL is **16.14**, privately bound inside Docker on the existing host.
  No staging database exists; port 5432 is not public. Supply a separate staging database,
  three distinct reviewed roles and a private host/TLS route. The prepared
  [Access TCP profile](cloudflare-private-postgres.md) uses a separate TLS staging service and
  origin Tunnel connector, plus the pinned client companion in every role image. It requires
  a separately pinned actual origin isolation inspection. The first deployment remains in a
  protected connectivity-only phase until actual SQL/TLS measurements **from Cloudflare
  Containers** pass; no bootstrap PASS is supplied by the builder.
  Workers Hyperdrive/VPC bindings cannot be consumed directly by the native Node PostgreSQL
  client inside a Container; binding access via outbound interception covers HTTP. The
  permitted Containers fallback therefore still needs independently proven private database
  transport. A configured database URL is not reachability or TLS evidence.
- No staging R2 buckets exist. Supply separate staging media/cache buckets, public R2 domains
  disabled and credentials restricted to staging. Production `ms-realty-media` and
  `ms-realty-production-opennext-cache` are forbidden as staging bindings. `NEXT_CACHE` reserves
  isolated cache for coordinated OpenNext work; this Containers adapter does not claim to use
  it. Seed staging with reviewed objects and verify actual bytes/count/load.
- Email Sending domain `notifications.makler-realty.com` is recorded Enabled / DNS Configured.
  The owner/controller must supply a sender local part and exactly one test recipient. Native
  declarations and the current [Email Sending Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
  support structured `EMAIL.send()` and `messageId` through `send_email`. Its
  [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
  support both recipient and sender allowlists, which this stage configuration pins. The legacy
  binding may have been Email Routing style. Actual binding capability/delivery remain unproved; no email
  was sent by local checks. Do not guess a sender or claim acceptance is delivery.
- Supply a private ClamAV endpoint with current signatures. `GTM_CONTAINER_ID` and
  `SITE_GOOGLE_VERIFICATION` are nonsecret reviewed configuration, not invented tracking IDs.
- GitHub Environment `staging` was created on 2 October through the owner-corrected `ms-realty`
  account, restricted to `codex/msr-staging`. Earlier403 responses came from the superseded
  identity. Install its own staging secrets using [the owner credential steps](staging-owner-credentials.md):
  a fresh environment-owned canonical `CLOUDFLARE_API_TOKEN`, an
  independently recorded `STAGING_CLOUDFLARE_TOKEN_SHA256` variable and environment-only
  `STAGING_ENVIRONMENT_TOKEN_SENTINEL` secret. The guard rejects a different fallback token.

The measured connectivity report is JSON with `status: PASS`, `database`, `engineVersion: 16.14`,
`tlsVerification: verify-full`, `from: cloudflare-containers`, and `exposesPublicPostgres: false`.
Its bytes, source, image, role sessions and independent origin-inspection hash are pinned.
`staging-connectivity.mjs` obtains the real protected measurements after the diagnostic deploy.
A socket listener, configured image digest, local fixture or operator-entered PASS is insufficient.
Runtime independently checks reviewed database name,
host and role before connecting. Role privileges and credential scope need actual operator review.

## Gateway, origin and public media

Access JWTs follow [Cloudflare's signature, issuer and audience contract](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
with expiration and type checks. Staging code also rejects unauthenticated requests itself.
Workers.dev and previews are disabled; the Container has no approved public origin route. The
app requires origin transport authentication on real production hosts, including health. Explicit
loopback qualification stays available. Only the authenticated gateway retains
`x-msr-rendered-path` for external-path canonical metadata; direct/local forged values are removed.
Origin denial still needs live checker proof. Rotation retains the existing previous-secret seam.

The gateway strips incoming internal and Access credentials, supplies fixed origin token/checked
host/external path and streams without following provider redirects. Every staging response the
Worker/app emits, including errors, redirects, APIs, media, static files, robots, sitemap and
`/llms.txt`, carries `X-Robots-Tag: noindex, nofollow` and private no-store. Robots separately
disallows staging crawl. Cloudflare-generated Access responses also require checker inspection.

Routes are the exact compact `LegacyRoute[]` `{host,path,query,status,targetPath,targetHost}`
artifact with pinned SHA-256. The route and media bytes are bundled into an ignored generated
module with the exact source commit; a local type-check fixture cannot serve or run jobs.
They are not environment bindings, which Cloudflare limits to 5 KB each. The corresponding
SHA-256 bindings still validate the exact bytes at runtime. Only reviewed equivalent 200s/301s are accepted. Historical terminal
404/410 entries and redirect chains fail closed. Query bytes/order are exact. Final destinations
are computed before http/www canonicalization so reviewed legacy redirects are one hop. Unknown
`.ru` paths have no invented homepage/search redirect. Retained `.ru` 200 deployment is held until
external-host self-canonical support is qualified; a reviewed equivalent 301 may target its exact
`.com` page. Source identity never approves equivalence.

The controller-owned checker may send `X-Msr-Legacy-Host` for one of the four exact legacy
apex/www hosts only after Access verification on the public staging origin. The pinned artifact's
logical targets stay production hosts; exercise responses use staging hosts. The header is stripped
before origin forwarding. Builders do not modify the independent checker or manufacture its PASS.

Photos use `/legacy-media/<sourceHost><encodedSourcePath>` or original `/wp-content/uploads/`,
backed only by the exact public-media allowlist in staging MEDIA. There is no private-object lookup,
arbitrary host, source-bucket fallback or runtime import. Missing objects fail to load. The current
1,710-row allowlist proves identity, not bytes or load success. Local development/loopback may
read only the two original public `/wp-content/uploads/` origins under CSP; staging uses isolated
media. Google origins enter CSP only with valid GTM and explicit public consent. Actual tags and
tracking parity remain separate proof.

The staging email relay allows only reviewed sender/inbox/plaintext and validated opaque Case
reply address. Attachments/arbitrary shapes are rejected before send. Durable receipts persist
uncertainty before the binding call; duplicates cannot blindly resend. Acceptance is not delivery.
Case email/inbound/Butler remain disabled in this adapter pending qualification.

The staging inquiry consumer is disabled by default. To exercise the notification gate, the
operator must set `email.inquiryCoverageNoticeEnabled: true` and
`email.testInboxReviewed: true` in the reviewed staging inputs. The consumer receives exactly
the one `email.allowedRecipients` inbox; an unreviewed or different destination cannot send.
It creates one transactional event/effect/job binding and sends only identifiers with the
canonical staff queue link. An accepted provider result is recorded as acknowledged; the
independent checker still needs actual test-inbox delivery. No customer message is sent by
this coverage template, and it cannot execute after `STAGING` becomes false.

## Guarded staging and independent promotion

Local checks make no provider writes:

```sh
npm ci --prefix gateway --ignore-scripts --no-audit --no-fund
node scripts/staging-types.mjs
gateway/node_modules/.bin/wrangler deploy --dry-run --config gateway/wrangler.containers.types.jsonc
node --test scripts/staging-contract.test.mjs
```

`.github/workflows/staging.yml` accepts dispatch or pushes to `codex/msr-staging`. Before resolving
its environment it requires repository flags `STAGING_ENVIRONMENT_CONFIGURED=true`,
`STAGING_DEPLOY_ENABLED=true`, exact `STAGING_SOURCE_QUALIFIED_SHA` and explicit
`STAGING_REVIEWED_RUNTIME=containers`. No flags are enabled here. That SHA must already have
integrated source/runtime checks, PG16.14 qualification and controller review. The workflow
validates inputs and fresh read-only provider preconditions before writes, builds once,
pins/attests D, rechecks prerequisites and deploys only staging routes in diagnostic mode. It
supplies isolated secrets, observes the actual three role images and measures both SQL drivers
for every prepared role. Only then does it release the same D and explicitly migrate. Errors
leave the adapter held; available candidate/provenance/connectivity evidence is retained even
on Actions failure. These artifacts do not imply independent parity PASS.

The workflow uses canonical `vars.CLOUDFLARE_ACCOUNT_ID` and `secrets.CLOUDFLARE_API_TOKEN` from
the protected staging environment. Its token fingerprint/sentinel guard runs before provider
access; the controller supplies them outside builder artifacts and must verify fresh environment
custody. Other secrets use the explicit `STAGING_` prefix: CF read token, database URLs,
auth/origin/relay/control proofs, service-token secret and R2 keys. Tokens must be restricted to
reviewed staging resources. Credentials never enter artifacts/logs. Secret upload verifies the
exact generated staging config before selecting its Worker.

`launch-gate.mjs` validates a controller-signed Ed25519 report and separately signed owner and
controller approvals. Trusted public keys come from protected external configuration, not builder
artifacts. The report pins D/source/base, route/media/input/provenance, baseline and all nine
evidence hashes; every gate must PASS. Signoffs pin the exact report and confirm screen review.
Stale/missing/FAIL/altered/wrong-D or same-key owner/controller evidence blocks. This validator
neither runs nor manufactures the checker. Local tests use ephemeral synthetic fixtures only.

`promotion.workflow.yml.example` is deliberately inactive. Before enabling automatic promotion,
the controller must wire/rehearse exact live route cutover, compatible production migration,
same-D artifact attestation verification, independent recheck within ten minutes, automatic
rollback on failure/timeout and untouched WordPress retained 90 days. Production route identities,
secret ownership, rollback adapter and independent checker remain missing. No production workflow,
DNS, provider resource, customer message or route was changed here.
