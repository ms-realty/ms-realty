# MS Realty — Production Deployment Plan (no custom domain)

Audited 2026-08-09 against live infrastructure; topology and gate state
re-audited 2026-08-24 (durable origin stage, origin proxy, current gate table).
This is the end-to-end runbook
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
     → CI "deploy_origin": tarball of the merge SHA over pinned SSH to
         MS_REALTY_DEPLOY_HOST, activated by
         production/scripts/deploy-production-review.sh —
         reclaims disk first (keeps running + incoming + 3 newest releases,
         prunes build cache, never images), takes a pre-deploy backup that is
         LOUD but non-fatal on failure (it restarts what it stopped), builds
         the release's own image, swaps /opt/ms-realty/current atomically,
         verifies /api/health locally and through the Worker
     → CI "deploy" (needs deploy_origin): wrangler 4.117.0 deploy --strict
         --keep-vars --containers-rollout immediate, image marker = merge SHA,
         pushes MS_REALTY_ORIGIN_TOKEN as a Worker secret
     → /api/health polled until build_marker == SHA (100×10s)
     → automatic `wrangler rollback` to prior version on failure

Cloudflare account 921d0224dcd595c87b7928d2b3c479d1 (ms.realty.bg@gmail.com, Workers Paid)
  Worker `ms-realty` (workers/index.js)
    ├─ /wp-content/uploads/*  → R2 `ms-realty-media` at the edge (immutable cache)
    ├─ /__media/* PUT         → R2 ingest (Bearer MEDIA_INGEST_SECRET)
    ├─ MS_REALTY_ORIGIN_URL set → EVERYTHING ELSE proxies to the durable origin
    │                           (X-MS-Realty-Origin-Token auth; the Container
    │                           becomes a fail-closed fallback only)
    ├─ mutation gate (no origin) → 503 for POST/PUT/PATCH/DELETE except: admin
    │                           session routes, the lead probe, public leads and
    │                           events when enabled, provider webhooks, /mcp
    │                           (writes stripped via MS_REALTY_MCP_WRITES_DISABLED),
    │                           and the durable listing/case authority routes
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
| `MS_REALTY_OPERATOR_2FA_KEY` | **not set → every two-factor call 400s.** Required, ≥32 characters (`production/lib/operator-two-factor.mjs:43-45`). It encrypts the enrolled TOTP secrets exactly as the contact vault key encrypts contacts, so enrolment, verification, the sign-in second factor and the step-up gate all refuse without it — the fail-closed outcome, not a fallback to "allow". Losing it after operators enrol disables verification for all of them; they must re-enrol. |
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
`validate-foundation.mjs` pins the committed launch-readiness snapshot to
exactly these blockers: `live_services`, `monitoring_rollback`,
`payload_runtime`, `production_recovery` — with `external_seo_exports`
recorded as deferred and `listing_quality_review` as pass. Clearing a gate
means updating both the evidence and that pinned assertion in the same
change; regenerating `launch-readiness.json` alone will fail CI.

## 5. Phase 3 — canonical Postgres live search

Production search has one fail-closed invariant: set
`MS_REALTY_SEARCH_ENGINE=postgres` together with `DATABASE_URL` and
`PAYLOAD_SECRET`. A missing value or any legacy engine selection blocks both
runtime search and live-service provisioning. Typesense and Meilisearch are
retained only for explicit non-production compatibility tooling; their URLs
and credentials are ignored by the production runtime.

Apply the public-search migration, capture the authoritative Postgres
projection and query evidence, then verify the public route:

```bash
MS_REALTY_SEARCH_ENGINE=postgres DATABASE_URL=... PAYLOAD_SECRET=... npm run search:sync
MS_REALTY_SEARCH_ENGINE=postgres DATABASE_URL=... PAYLOAD_SECRET=... npm run search:query
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

Observed 2026-08-25: dispatch runs created with a personal access token
failed before their first step three times in a row (job concludes
"failure" with an empty steps list within seconds), while the auto-merge
bot's own dispatches ran normally the same night. If the manual dispatch
exhibits that signature, do not debug the workflow - merge any pending
green PR and let the bot's dispatch deploy main.

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

### Runbook: photo upload storage (admin editor and seller intake)

Uploaded photos go through one small storage interface
(`production/lib/media-upload-storage.mjs`), so moving from a laptop to
Cloudflare is configuration, not a rewrite.

| Variable | Default | Meaning |
|---|---|---|
| `MS_REALTY_MEDIA_UPLOAD_DRIVER` | `local` | `local` writes to disk, `r2` writes through the Worker ingest route above |
| `MS_REALTY_MEDIA_UPLOAD_DIR` | `production/data/media-uploads` | local driver root, git-ignored, laid out `<root>/<host>/<key>` like the media mirror |
| `MS_REALTY_MEDIA_UPLOAD_R2_ENDPOINT` | *(unset)* | e.g. `https://ms-realty.ms-realty-bg.workers.dev/__media/` |
| `MS_REALTY_MEDIA_INGEST_SECRET` | *(unset)* | the same value as the Worker's `MEDIA_INGEST_SECRET` |
| `MS_REALTY_MEDIA_UPLOAD_HOST` | `makler-realty.com` | key/URL host prefix |
| `MS_REALTY_MEDIA_UPLOAD_LEDGER_PATH` | `production/data/media-uploads.jsonl` | upload metadata ledger |
| `MS_REALTY_MEDIA_UPLOAD_MAX_FILE_BYTES` | `8388608` | per file, clamped to `MS_REALTY_MAX_BODY_BYTES` |
| `MS_REALTY_MEDIA_UPLOAD_MAX_REQUEST_BYTES` | `MS_REALTY_MAX_BODY_BYTES` | per request, never above the transport body limit |
| `MS_REALTY_MEDIA_UPLOAD_MAX_FILES` | `8` | files per request |
| `MS_REALTY_SELLER_PHOTO_MAX_PER_ENQUIRY` | `12` | photos one enquiry can hold |
| `MS_REALTY_SELLER_PHOTO_UPLOAD_DISABLED` | *(unset)* | `1` removes the public seller photo control and the endpoint |

Every accepted upload is decoded, turned upright, resized and re-encoded by
`production/lib/image-optimizer.mjs` before it is stored — the admin editor and
the public seller intake share one step with one set of settings.

| Variable | Default | Meaning |
|---|---|---|
| `MS_REALTY_IMAGE_MAX_EDGE` | `2560` | long edge in pixels; images are fitted inside it and never enlarged |
| `MS_REALTY_IMAGE_QUALITY` | `82` | JPEG (mozjpeg) and WebP quality, 1–100 |
| `MS_REALTY_IMAGE_THUMBNAIL_EDGE` | `640` | long edge of the WebP thumbnail stored beside each photo |
| `MS_REALTY_IMAGE_MAX_PIXELS` | `50000000` | decode-bomb cap; a header declaring more is refused with 415 before any decode |

All four fail loudly at startup if they are not positive integers (quality must
also be ≤ 100), because a silently clamped encoder setting is worse than a
refused boot.

What the pipeline decides, and why it may not be what you expect:

- **Rotation happens before metadata is stripped.** A phone held sideways
  writes the rotation into EXIF and leaves the pixels alone. Stripping EXIF
  first discards the tag and keeps the sideways pixels, which is how photos
  used to end up permanently on their side. The strip still runs, and runs last,
  on the bytes actually stored.
- **PNG stays PNG only when it has an alpha channel**, which JPEG cannot
  represent. An opaque PNG is encoded both ways and the smaller wins, so flat
  graphics stay PNG and PNG-wrapped photographs become JPEG.
- **WebP is only recompressed when it saves more than 10%**, since recompressing
  costs a generation of quality. JPEG and PNG only have to beat break-even.
  A rotation or a downscale is never declined on size grounds.
- **AVIF is passed through untouched.** Re-encoding it would turn the
  sanitiser's "refuse metadata I cannot strip" into a silent acceptance.
- **A photo already below the thumbnail edge gets no rendition**, because a
  second copy of an already small image is wasted storage.

The thumbnail is stored beside its photo under the same content hash
(`ms-<hash>.jpg` gains `ms-<hash>-thumb.webp`) and therefore in the same key
space — which is what keeps a seller's thumbnail as unreachable from the edge
as the seller's photo. Admin surfaces fetch it from the existing preview route
via `?rendition=thumb`; an unknown rendition name falls back to the full photo
rather than failing.

Two key spaces, and the difference matters:

- `makler-realty.com/wp-content/uploads/<YYYY>/<MM>/ms-<hash>.<ext>` — listing
  photos uploaded by an operator. The edge serves `/wp-content/uploads/*` from
  R2, so an approved photo resolves at its public URL like every mirrored asset.
  Being fetchable is **not** being published: the asset stays out of the listing
  payload, gallery, and search until a human approves it in the media review.
- `makler-realty.com/wp-content/private/enquiries/<enquiry>/ms-<hash>.<ext>` —
  photos a seller attached to their own enquiry. The ingest route accepts the
  key (it is under `*/wp-content/`), but `serveMedia` in `workers/index.js` only
  routes requests whose path starts with `/wp-content/uploads/`, so the object
  has no edge URL at all. Keep that routing rule if you change the Worker.

Set `MS_REALTY_MEDIA_UPLOAD_DRIVER=r2` plus the endpoint and secret to store in
R2. The driver verifies the echoed `size` for the same reason the bulk runbook
above does, and refuses to record a write it cannot confirm. Reading bytes back
for the admin preview only works on the `local` driver; on `r2` the preview
route answers 503 and names the reason rather than pretending.

## 7. Out of scope today — the domain-cutover gates

As of the committed `production/data/launch-readiness.json` (2026-08-24), 7 of
12 gates pass — `redirect_reviews` and `listing_quality_review` among them —
`external_seo_exports` is deferred by decision, and 4 remain blocked. None are
required to operate workers.dev. The blocked four:

| Gate | Needs | Class |
|---|---|---|
| `payload_runtime` | Phase 2 of this plan | **cleared by this plan** |
| `live_services` | live Postgres sync/query evidence + self-hosted Hermes on non-local hosts + capture reports | infra + money |
| `monitoring_rollback` | monitoring-drill workflow run (its "failure" at the alert-probe step is the alert being exercised, by design) + the machine-evidence artifact + an alert-delivery receipt (the Message-ID of GitHub's failure email), fed to `npm run monitoring:report`; evidence is perishable | provider + human inbox |
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
2. Set Worker var `MS_REALTY_LEAD_DURABLE_STORE_ENABLED=true`. The edge admits
   only the exact `POST /api/leads` when that flag, `PAYLOAD_SECRET`,
   `DATABASE_URL`, and a valid `MS_REALTY_LEAD_CONTACT_KEY` are all present;
   incomplete configuration remains a 503 rather than falling back to disk.
3. Deploy the guarded edge admission only after a test submission is confirmed
   in Postgres. The Next handler additionally requires an exact same-origin
   browser `Origin`; missing, opaque, or spoofed origins are rejected before
   persistence. The visible contact form uses the same durable-store readiness
   predicate and stays hidden whenever any required binding is missing.

Contact details stay encrypted with `MS_REALTY_LEAD_CONTACT_KEY`; Postgres
only ever receives the AES-256-GCM envelope. Losing that key orphans every
stored contact, so it belongs in the password manager, not only in Cloudflare.

## 9. Fast-follow code changes (next PRs, in priority order)

1. **Public lead Origin guard implemented** — `POST /api/leads` requires an
   exact same-origin browser `Origin`, and the Worker requires the complete
   durable runtime before forwarding it.
2. **Payload production boot is fail-closed** — missing or placeholder
   `PAYLOAD_SECRET` and missing `DATABASE_URL` refuse production config import.
3. **No migration runner in the deploy path** — add `payload:migrate` npm
   script + a deploy-time (or boot-time) `payload migrate` step, and assert
   applied migrations in `payload:runtime` evidence.
4. **Keep Payload internal** — `/payload-admin` and direct `/api/admins/*`
   remain edge-hidden; the client-facing `/admin` workbench resolves Payload
   sessions and enforces role/workspace access server-side.
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
- [x] Phase 3 contract corrected: production search is Postgres-only and stays
      fail-closed until its runtime configuration and live evidence pass

Everything unchecked is an operator (dashboard/provider) action with exact
steps above; no further code is required to complete them.
