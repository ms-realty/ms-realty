# MS Realty — Production Deployment Plan (no custom domain)

Audited 2026-08-09 against live infrastructure. This is the end-to-end runbook
for operating the production deployment on `*.workers.dev` **before** the
`makler-realty.com` / `makler-realty.ru` domains are attached. Domain cutover
remains governed by the 12 launch gates (`production/data/launch-readiness.json`,
see §7); nothing here overrides them.

**Key architectural fact:** the launch gates gate *domain cutover and
indexing*, not the deploy. The Worker deploy pipeline is already live and
verified; `*.workers.dev` serves `noindex` (keyed on hostname in
`workers/preview-host.mjs`), so operating it publicly leaks no search equity.

---

## 1. Topology

```
GitHub ms-realty/ms-realty (private)
  PR → CI "check" (audit, tests, validate, next build+smoke, container smoke)
     → auto-merge (squash, collaborators only, exact-head)
     → repository_dispatch: auto_merge_deploy
     → CI "deploy": wrangler 4.117.0 deploy --strict --keep-vars
         --containers-rollout immediate, image marker = merge SHA
     → /api/health polled until build_marker == SHA (100×10s)
     → automatic `wrangler rollback` to prior version on failure

Cloudflare account 921d0224dcd595c87b7928d2b3c479d1 (ms.realty.bg@gmail.com, Workers Paid)
  Worker `ms-realty` (workers/index.js)
    ├─ /wp-content/uploads/*  → R2 `ms-realty-media` at the edge (immutable cache)
    ├─ /__media/* PUT         → R2 ingest (Bearer MEDIA_INGEST_SECRET)
    ├─ mutation gate          → 503 for all POST/PUT/PATCH/DELETE except the four
    │                           /api/admin/cases* paths when case authority is enabled
    └─ everything else        → Container `MsRealtyContainer` (singleton, basic,
                                `next start` on :8080, ephemeral disk, sleeps 20m)
  Durable Object namespace MS_REALTY (container lifecycle, SQLite-backed class)
  R2 bucket ms-realty-media (keys prefixed makler-realty.com/ and makler-realty.ru/)
```

Live URL: `https://ms-realty.ms-realty-bg.workers.dev`
(CI resolves the subdomain via the API — never hardcode it in code.)

- The Container image bakes the repo (seed data, ledgers' initial state) at the
  merge SHA; `/api/health` reports that SHA as `build_marker`. An old container
  cannot impersonate a new deploy.
- Container disk resets on every wake. Nothing mutable may live there — the
  edge mutation gate exists precisely to stop silent data loss.
- `workers/` and `wrangler.jsonc` are in `.dockerignore`; edge-only changes do
  not invalidate the image layers.

## 2. Audited state (2026-08-09)

> **Update, 2026-08-09 evening — Phases 1, 2 and 4 executed.** Operator
> credentials live (`MS_REALTY_ADMIN_CREDENTIALS_JSON` set, both dead secrets
> deleted), Postgres provisioned on **Neon** (project in `aws-eu-central-1`,
> pooled DSN on the Worker, direct DSN for migrations), all 6 migrations
> applied, first Payload admin seeded, case-authority vars enabled,
> `payload:preflight` all-green, admin API verified 200 and case POST reaches
> Payload (400 validation, not edge-503). Uptime monitoring runs as the
> `health-check.yml` scheduled workflow. Phase 3 (Typesense) deferred — the
> account is PayPal-only, so `/search` stays fail-closed 503 for now. The
> tables below preserve the pre-fix morning audit for history.

Verified live:

| Check | Result |
|---|---|
| `GET /api/health` | 200, `build_marker` == `main` HEAD (e66378c) |
| `GET /` | 308 → `/bg`; locale pages 200; `x-robots-tag: noindex` on workers.dev |
| `GET /robots.txt` | `Disallow: /` (preview host) |
| `GET /sitemap.xml` | 200, canonical URLs point at makler-realty.com |
| R2 media | 200 for mirrored keys; **some legacy size variants 404** (see §8) |
| `GET /api/admin/*` | **401 — admin is unusable** (secret name drift, §3) |
| `POST /api/leads` (any write) | **503 `runtime_data_unavailable`** (durable store absent) |
| `/{locale}/search`, `/api/search` | **503 — fail-closed**, no engine configured |
| CI/deploy history | last auto deploy 2026-07-31, green, auto-rollback armed |
| Container | Active, 1 instance, basic (1 GiB / 4 GB) |
| Local `wrangler whoami` on the dev Mac | **wrong account (ironwrap)** — local deploys are impossible/forbidden; only CI deploys |

Worker secrets currently set (dashboard → Workers → ms-realty → Settings):

| Secret | Verdict |
|---|---|
| `DATABASE_URL` | set, **unproven** (payload_runtime gate never passed; target unknown) |
| `PAYLOAD_SECRET` | set, unproven (gate requires ≥32 bytes, non-placeholder) |
| `MEDIA_INGEST_SECRET` | set, working |
| `MS_REALTY_LEAD_CONTACT_KEY` | set (AES-256-GCM contact-vault key; keep safe — losing it orphans vault data) |
| `MS_REALTY_ADMIN_OPERATORS_JSON` | **dead name — no code reads it.** Code reads `MS_REALTY_ADMIN_CREDENTIALS_JSON`, which is NOT set → every admin request 401s. This is the exact incident documented in `production/test/cloudflare-container-config.test.mjs:45-51`, still unfixed in the dashboard. |
| `MS_REALTY_SESSION_SECRET` | **dead — nothing in the repo reads it** |

Plain-text vars: none set. Therefore `MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED`
/ `MS_REALTY_WORKSPACE_ID` are unset and the edge mutation gate is fully
closed — even the four durable case paths 503.

## 3. Phase 1 — repair Worker secrets (operator, ~20 min, no deploy needed)

Secret changes apply to the running Worker immediately; no redeploy required.
All steps in dashboard → Workers & Pages → `ms-realty` → Settings → Variables
and secrets. The CI deploy uses `--keep-vars`, so dashboard-set values survive
every future deploy.

1. Generate operator credentials locally (one per human, token ≥24 chars):

   ```bash
   node -e 'const c=require("node:crypto");console.log(JSON.stringify([
     {id:"ivan",  token:c.randomBytes(24).toString("hex"), roles:["admin"]},
     {id:"broker1", token:c.randomBytes(24).toString("hex"), roles:["broker"]},
   ]))'
   ```

   Valid roles: `admin, broker, editor, translator, agent`
   (`production/lib/admin-auth.mjs`). Store the output in the family password
   manager — it is shown nowhere else.

2. Add secret `MS_REALTY_ADMIN_CREDENTIALS_JSON` = that JSON array.
   (Once set, the legacy shared-token path is disabled entirely — this is the
   only mutating admin path that works on Cloudflare anyway, since the Worker
   does not forward `MS_REALTY_ADMIN_ACTOR`.)
3. Delete dead secrets `MS_REALTY_ADMIN_OPERATORS_JSON` and
   `MS_REALTY_SESSION_SECRET` (values are unreadable and unused; removing them
   ends the name-drift confusion).
4. If unsure `PAYLOAD_SECRET` meets the contract (≥32 bytes, not a
   placeholder), rotate it now: `openssl rand -hex 32`. It signs Payload JWTs
   only; rotating logs admins out, nothing else.
5. Verify:

   ```bash
   curl -sS -H "Authorization: Bearer <ivan token>" \
     https://ms-realty.ms-realty-bg.workers.dev/api/admin/launch-readiness | head -c 300
   ```

   Expect 200 JSON (was 401). Admin HTML workbench at `/admin` now works
   read-only (mutations still 503 by design until Phase 2b).

## 4. Phase 2 — durable Postgres + Payload runtime (operator + one provider decision, ~1–2 h)

No Postgres provider is named anywhere in the repo; the shipped
`docker-compose.payload.yml` is loopback-only and the readiness contract
deliberately rejects loopback/`.local` hosts (`production/lib/payload-runtime.mjs`).
A managed public-DNS Postgres passes without extra flags.

**Recommendation: Neon free tier** (no credit card — matches this account's
PayPal-only constraint; EU region; Postgres 16; TLS; ~0.5 GB storage dwarfs the
165-listing dataset). Supabase free is the fallback (pauses after 7 idle days —
worse fit for a low-traffic site).

### 2a. Provision + migrate + first admin (local machine)

```bash
# worktrees need a real install; Turbopack rejects symlinked node_modules
npm ci --no-audit --no-fund

export PAYLOAD_SECRET='<the value now in the Worker secret>'
export DATABASE_URL='postgresql://<user>:<pass>@<neon-host>/<db>?sslmode=require'

# apply the 6 committed migrations (migrations/index.ts); there is no deploy-time
# migration runner yet (§9), so this manual step IS the schema deployment
node_modules/.bin/payload migrate

# create the first admin user through a local runtime against the prod DSN
# (the edge 503s ALL non-case POSTs, including Payload login/first-register,
# so /payload-admin cannot be initialized through the Worker — see §9)
npm run next:build && node_modules/.bin/next start -p 3000
# → http://localhost:3000/payload-admin → create first user
```

### 2b. Wire the Worker (dashboard)

1. Update secret `DATABASE_URL` to the Neon **pooled** DSN.
2. Add plain vars (Variables, not secrets — they are flags, not credentials):
   - `MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED` = `true`
   - `MS_REALTY_WORKSPACE_ID` = `workspace-sandanski`
   - leave `MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED` unset
3. Verify durable case writes end-to-end (the only edge-open mutations):

   ```bash
   curl -sS -X POST https://ms-realty.ms-realty-bg.workers.dev/api/admin/cases \
     -H "Authorization: Bearer <ivan token>" -H "content-type: application/json" \
     -d '{}' -o - -w '\n%{http_code}\n'
   ```

   Expect a 4xx validation error from the app (not the edge 503) — proof the
   request reached Payload/Postgres. Then create a real case from `/admin/cases`.

### 2c. Record the evidence (clears the `payload_runtime` gate input)

```bash
MS_REALTY_GENERATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) npm run payload:runtime
npm run payload:preflight        # asserts all 9 checks incl. real TCP connect
```

The report is gitignored evidence, not a commit. Note: CI's
`validate-foundation.mjs` currently *requires* the committed launch-readiness
snapshot to stay blocked (with `external_seo_exports`, `live_services`,
`redirect_reviews` among blockers) — clearing `payload_runtime` evidence is
CI-safe; do **not** regenerate the committed `launch-readiness.json` today.

## 5. Phase 3 — live search (optional today; decision box)

Search fails closed by design: `/{locale}/search` and `/api/search` return 503
until an engine is configured. PR #16 selected **Typesense** for production
review.

- **Option A (recommended when billing allows): Typesense Cloud**, smallest
  single node (~$22/mo, card required — conflicts with the no-card constraint;
  if the PayPal-only constraint still holds, defer).
- **Option B: keep 503.** Honest state; listings remain fully browsable via
  location/listing pages. Zero cost.
- Self-hosting (VPS) is the domain-era plan alongside Meilisearch + Hermes.

If provisioning: set Worker secrets `TYPESENSE_URL`, `TYPESENSE_API_KEY`,
`TYPESENSE_COLLECTION`, then push the projection and verify from the repo:

```bash
TYPESENSE_URL=... TYPESENSE_API_KEY=... npm run search:sync
curl -sS 'https://ms-realty.ms-realty-bg.workers.dev/api/search?q=sandanski&locale=bg' | head -c 300
```

## 6. Phase 4 — monitoring & operations (today, ~15 min)

- **Uptime:** add a free external monitor (e.g. UptimeRobot) on
  `GET /api/health`, keyword-match `"status":"ok"`, 5-min interval, alert to
  the operations email. workers.dev needs no domain for this.
- **Logs:** Workers Logs already enabled (`observability` in wrangler.jsonc);
  live tail via dashboard → Worker → Logs.
- **`/api/ready`** stays 503 until all launch gates pass — that is the honest
  domain-cutover signal, not an outage. Do not "monitor" it as uptime.
- **Deploy verification:** every deploy self-verifies `build_marker` and
  auto-rolls-back; the deploy job's green check IS the release proof.

### Runbook: routine deploy
Open a PR → wait for green CI → auto-merge → auto-deploy. Nothing manual.
Concurrency guard: deploys never cancel mid-flight.

### Runbook: manual redeploy of main (pipeline stuck / re-push image)
```bash
T=$(gh auth token -u ms-realty)
GH_TOKEN=$T gh api repos/ms-realty/ms-realty/dispatches \
  -f event_type=auto_merge_deploy \
  -F "client_payload[merge_sha]=$(git rev-parse origin/main)"
```
(The deploy job only accepts the exact current `main` SHA. There is
deliberately no `workflow_dispatch`.)

### Runbook: manual rollback
Dashboard → Workers → ms-realty → Deployments → roll back to a prior version;
or with an MS-Realty-account API token:
`npx wrangler@4.117.0 rollback <version-id> --name ms-realty --yes`.
Never deploy from the dev Mac's default wrangler login — it is OAuth'd to a
different account (ironwrap); the only sanctioned credentials are CI's
`CLOUDFLARE_API_TOKEN` (GitHub secret) scoped to account `921d0224…`.

### Runbook: bulk media ingest
`wrangler r2 object put` silently drops throttled writes — never use it for
bulk. Use the Worker ingest path (same code path the site reads from):
```bash
curl -sS -X PUT --data-binary @file.jpg \
  -H "Authorization: Bearer $MEDIA_INGEST_SECRET" \
  -H "content-type: image/jpeg" \
  "https://ms-realty.ms-realty-bg.workers.dev/__media/makler-realty.com%2Fwp-content%2Fuploads%2F2025%2F04%2Ffile.jpg"
```
Verify the echoed `size` equals the local byte count. Keys must stay under the
two `*/wp-content/` prefixes; 32 MB cap.

## 7. Out of scope today — the domain-cutover gates

7 of 12 launch gates remain blocked. None are required to operate workers.dev.
Tractability, easiest first:

| Gate | Needs | Class |
|---|---|---|
| `payload_runtime` | Phase 2 of this plan | **cleared by this plan** |
| `redirect_reviews` | 292 human same-content decisions (pages/posts/taxonomies) in `migration/reviews/redirect-approvals.csv` | repo-only, human judgement |
| `listing_quality_review` | complete 165-row reviewer CSV (`migration/reviews/listing-quality.csv`) | human (broker/editor) |
| `live_services` | real Typesense + Meilisearch + self-hosted Hermes on non-local hosts + capture reports | infra + money |
| `external_seo_exports` | verified GSC + Yandex properties for both legacy domains + backlinks export | **domain-dependent** |
| `monitoring_rollback` | monitoring provider run + canary + isolated rollback drill, evidence <24 h old; transitively needs SEO exports | domain-dependent, perishable |
| `production_recovery` | off-site encrypted backup + isolated restore drill, two distinct named humans | provider + humans |

Also required before cutover: R2 media coverage report (§8) and relaxing the
`validate-foundation.mjs` stay-blocked assertion as gates genuinely clear.

## 8. Known gaps & accepted risks (current preview state)

1. **Lead capture is off** (`POST /api/leads` → 503). Leads/consents/audit are
   JSONL-on-disk designs; on ephemeral container disk they would be silently
   lost, so the edge blocks them. The site is phone-first — `tel:`/messenger
   contact paths work. Durable leads (Payload collection or DO-SQLite) is the
   top post-ship code task; until then this is an accepted, honest limitation.
2. **MCP connector dead on Cloudflare** (JSON-RPC POSTs hit the same 503).
3. **Payload admin unreachable through the edge** (login POST is blocked);
   operate it locally against the prod DSN (§4) until the edge allowlist is
   extended (§9.4).
4. **R2 media mirror is partial**: spot-checks show some legacy size variants
   404 (e.g. `ofis-300x225.jpg`); 1,714 objects mirrored vs 11,859 media rows
   in the crawl DB. Cosmetic on the noindex preview; build a coverage report
   (migration DB × R2 listing) before any domain cutover.
5. **Search 503** until Phase 3 runs.
6. **Rate limiting** covers only the four public write paths and is in-process
   (single container instance pinned by design). Admin GETs, `/api/search`,
   and page renders are unlimited — a cheap wake-the-container DoS surface.

## 8a. Turning public lead capture back on

Lead intake is blocked at the edge because the container disk forgets. The
durable path now exists (`production/lib/lead-durable-store.mjs`, collections
`public_leads` + `lead_contacts`); enabling it is a deliberate operator
sequence, not a deploy:

1. Generate and apply the migration for the two new collections against the
   production DSN — same direct (non-pooled) DSN used for the first migration:

   ```bash
   DATABASE_URL="$(grep '^DATABASE_URL_DIRECT=' ~/.ms-realty-prod.env | cut -d= -f2-)" PAYLOAD_SECRET="$(node -p 'require(process.env.HOME+"/.ms-realty-operators.json").payloadSecret')" NODE_ENV=production node_modules/.bin/payload migrate:create durable_lead_store
   ```

   Review the generated file, then apply it with `payload migrate`.
2. Set Worker var `MS_REALTY_LEAD_DURABLE_STORE_ENABLED=true` (the store stays
   off unless `PAYLOAD_SECRET` and `DATABASE_URL` are also present, so a
   half-provisioned deployment keeps failing closed rather than losing leads).
3. Extend the edge allowlist to `POST /api/leads` only after a test submission
   is confirmed in Postgres, then flip the contact page back to the form by
   clearing `MS_REALTY_MCP_WRITES_DISABLED` for that path.

Contact details stay encrypted with `MS_REALTY_LEAD_CONTACT_KEY`; Postgres
only ever receives the AES-256-GCM envelope. Losing that key orphans every
stored contact, so it belongs in the password manager, not only in Cloudflare.

## 9. Fast-follow code changes (next PRs, in priority order)

1. **CSRF guard missing in `app-api-adapter.mjs`** — the Next runtime's public
   write routes skip `request-guard`; `http.mjs` and the admin adapter enforce
   it. Masked today by the edge 503; becomes live the moment writes open.
2. **`payload.config.js` fails open** — dev-default secret and localhost DSN
   ship as fallbacks; add a production boot assert (NODE_ENV=production +
   placeholder secret ⇒ refuse to start).
3. **No migration runner in the deploy path** — add `payload:migrate` npm
   script + a deploy-time (or boot-time) `payload migrate` step, and assert
   applied migrations in `payload:runtime` evidence.
4. **Extend the edge mutation allowlist** to `/(payload)/api` auth +
   collection routes once `DATABASE_URL` is proven, so `/payload-admin` works
   through the Worker.
5. **Proxy trust**: `x-forwarded-for` is trusted unconditionally (rate-limit
   evasion); `MS_REALTY_TRUST_PROXY` is forwarded but read by nothing (escapes
   the dead-binding test because it is a literal). On Cloudflare, prefer
   `cf-connecting-ip`.
6. **`local-admin-smoke`** shared token is disabled only by
   `NODE_ENV=production`; add a second guard (e.g. refuse the constant when a
   build marker is present).
7. Durable leads storage (see §8.1) — the single change that turns the preview
   into a lead-generating production system.

## 10. Definition of "shipped today"

- [x] Deploy pipeline green; live `build_marker` == `main` HEAD (verified 2026-08-09)
- [x] This plan merged through the sanctioned PR → auto-merge → auto-deploy path
      (which also required unbreaking the repo-wide red `npm audit` via the
      Payload 3.87.1 bump in the same PR)
- [x] Phase 1: admin credentials fixed, dead secrets removed, admin API 200
- [x] Phase 2: Neon provisioned, migrations applied, first admin created,
      case-authority writes verified, `payload:preflight` green
- [x] Phase 4: uptime monitor armed (`health-check.yml`, hourly, fails loud on
      unhealthy response; GitHub emails the workflow author)
- [x] Phase 3 decision recorded: deferred — Typesense Cloud needs a card, the
      account is PayPal-only; `/search` stays honestly fail-closed until then

Everything unchecked is an operator (dashboard/provider) action with exact
steps above; no further code is required to complete them.
