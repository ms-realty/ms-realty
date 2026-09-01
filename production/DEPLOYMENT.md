# MS Realty production runbook

The sole indexable public authority is `https://makler-realty.com`. Public
pages, robots, sitemaps, and canonical journey probes use that origin. The
noindex `https://ms-realty.ms-realty-bg.workers.dev` endpoint remains the
operator/admin, OAuth, MCP, media-upload, health, and deployment origin. The
`.ru` domain remains a historical source and R2 namespace pending a separate
approved cutover.

## Runtime topology

```text
client
  -> Cloudflare Worker `ms-realty`
       -> R2 `ms-realty-media` for /wp-content/uploads/*
       -> authenticated durable origin for every other production route
       -> Container fallback only when the durable-origin binding is absent

GitHub pull request
  -> npm check
  -> exact-head auto-merge
  -> repository_dispatch `auto_merge_deploy`
       -> deploy immutable origin release
       -> deploy Worker for the same SHA
       -> verify Worker and origin markers plus readiness
       -> restore the previous origin release and Worker version on failure
```

`wrangler.jsonc` pins the Worker name, account, durable-origin ingress,
operational workers.dev origin, R2 binding, and build-marker placeholders. The durable
origin accepts Worker traffic only with `X-MS-Realty-Origin-Token`; it is not a
second public authority.

Mutable CRM, CMS, admin-session, audit, and integration state belongs in
Payload/Postgres or another explicitly durable provider. Container disk is
ephemeral and must not become an authority. Public media belongs in R2.

## Readiness and evidence sources

Two evidence layers serve different purposes:

### Committed baseline

- `production/data/launch-readiness.json` is the reproducible repository
  baseline built from committed inputs. It records which gates pass when no
  private runtime reports are mounted.
- `production/data/launch-input-checklist.md` is generated from that baseline
  and names only the evidence still required for its state.
- `production/scripts/validate-foundation.mjs` protects the baseline contract
  in CI. It cannot prove that a live provider, backup, alert, or deployed
  release is healthy.

Regenerate the baseline only when its source inputs change:

```bash
npm run launch:readiness
npm run launch:inputs
node production/scripts/validate-foundation.mjs
```

### Runtime materialized evidence

The deployed release materializes private provider reports and the exact-SHA
R2 report. Production is proven only from the exact repository-dispatch run and
the operational workers.dev and canonical `.com` responses for that same SHA:

1. `GET /api/health` must return HTTP 200 with `status: "ok"`;
   `build_marker` and `origin_build_marker` must both equal the exact
   40-character release SHA.
2. `GET /api/ready` must return HTTP 200 with `status: "ready"` and
   `blockers: []`. Its response is `no-store` and reflects the materialized
   runtime evidence, not a cached repository snapshot.
3. `GET /admin/login` must return HTTP 200 and remain noindex through the
   workers.dev operator origin.
4. The GitHub run for `auto_merge_deploy` must show `npm check`,
   `Deploy durable origin`, and `Deploy production` as successful for that SHA.
5. The canonical `.com` journey probe must pass with root HTTP 200, indexable
   public metadata, and a `.com` sitemap.
6. The exact-release R2 report must be embedded in both release artifacts and
   have `missing_count=0` with a matching `release_sha`.

Useful read-only checks:

```bash
release_sha='<40-character main SHA>'
operator='https://ms-realty.ms-realty-bg.workers.dev'
public='https://makler-realty.com'

curl --fail --silent --show-error "$operator/api/health"
curl --fail --silent --show-error "$operator/api/ready"
curl --fail --silent --show-error --output /dev/null "$operator/admin/login"
MS_REALTY_PRODUCTION_URL="$public" \
  MS_REALTY_EXPECTED_BUILD_MARKER="$release_sha" \
  node production/scripts/probe-production-journeys.mjs
```

Do not infer live readiness from the committed baseline alone. Do not infer an
exact release from a green process check alone. The markers, ready response,
and deployment run must agree.

## Routine release

1. Open a focused pull request from a task branch.
2. Wait for the required `npm run check` job.
3. The repository app auto-merges the exact reviewed head.
4. The resulting repository dispatch deploys the durable origin first and the
   Worker second.
5. Wait for both deployment jobs and verify the runtime proof above.

Deployment concurrency is serialized. Do not start a second release while the
current exact-SHA release is activating.

The workflow captures a credential-free R2 ListObjectsV2 inventory, builds an
exact-release coverage report with `npm run r2:media:coverage`, embeds that same
report in the origin and Worker artifacts, and rejects missing runtime assets.
Unexpected keys remain visible but never substitute for missing assets.

## Rollback

The production job records the active origin release before activation. If the
Worker upload or exact-SHA verification fails, CI rolls the Worker back and
atomically repoints `/opt/ms-realty/current` to the recorded origin release.
The rollback check must show the restored origin marker through workers.dev.

For an operator-initiated rollback, select a known-good Worker deployment in
the Cloudflare dashboard and restore the matching origin release. Verify
`/api/health`, `/api/ready`, and `/admin/login` again. Never restore only one
layer and leave edge and origin markers different.

## Runtime configuration

Keep all secret values outside Git. The deployment uses GitHub secrets and the
durable host's private environment; `wrangler deploy --keep-vars` preserves
Cloudflare-managed variables. Runtime configuration is valid only when the
corresponding redacted report and preflight pass.

| Area | Runtime proof |
|---|---|
| Payload/Postgres | `npm run payload:runtime`, then `npm run payload:preflight` |
| Postgres search | `npm run search:sync` and `npm run search:query` against the production database |
| Hermes drafts | `npm run hermes:runtime`, `npm run hermes:provisioning`, then the authenticated draft-worker report |
| Live services | `npm run live:provisioning:preflight`, `npm run live:capture`, then `npm run live:preflight` |
| Monitoring/rollback | `npm run monitoring:preflight` with current alert, canary, and isolated rollback evidence |
| Recovery | verified signed report from encrypted backup and isolated restore workflows |
| Full launch evidence | `npm run launch:evidence:capture`, then `npm run launch:evidence:verify` for the exact release SHA |

Examples and smoke fixtures document schemas; they never clear a runtime gate.
Private reports stay ignored and are mounted only where the launch materializer
can validate them.

## Admin and integrations

`/admin/login` is the only public admin sign-in entry. Payload's internal admin
UI and direct identity collection routes stay edge-hidden. Admin sessions,
role/workspace checks, step-up controls, provider OAuth state, and connection
tokens are enforced server-side.

Provider callbacks and webhooks must use the workers.dev operator origin. A connection
is operational only after the admin connection status, provider callback, and
one read or draft operation succeed without exposing credentials. Hermes stays
inside its draft-only policy: it may prepare work, but it cannot publish pages,
send customer messages, approve legal claims, or make translations indexable.

## Media operations

Historical R2 keys keep their `makler-realty.com/` and `makler-realty.ru/`
prefixes. New approved listing uploads use the
`ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/` namespace. Seller
enquiry uploads remain under the private enquiries namespace and have no public
edge route.

Every upload passes through `production/lib/image-optimizer.mjs` before storage.
The R2 driver verifies the echoed byte count before recording a successful
write. Use the existing upload APIs; do not bypass them with unverified bulk
writes.

## Operating rule

Code, CI, origin, Worker, provider, and browser evidence are separate layers.
A change is deployed only when the exact SHA is merged, both deployment jobs
pass, edge and origin markers match, readiness has no blockers, and the affected
workers.dev operator checks and canonical `.com` journey succeed.
