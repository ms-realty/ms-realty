# MS Realty — End-to-End Audit

Date: 2026-07-25 · Branch `main` @ `cccb551` · 37.7k LOC in `production/lib`, 490 tests passing.

Method: read the canonical docs, ran the test suite, booted `production/server.mjs` and probed the
live HTTP surface, analysed the generated `production/data/*` artifacts, and traced the security,
storage, and rendering paths. Every finding below was verified against running code or generated
data, not inferred from documentation.

**Verdict.** The deterministic-contract layer is genuinely strong: 490 tests, append-only ledgers,
AES-256-GCM contact vaults, capability-scoped admin model, dual-runtime parity tests, an honest
launch gate that currently says `launch_ready: false`. What is missing is not polish — it is the
three load-bearing systems the product claims to have: **a media host, a message sender, and a
login.** Plus five cutover-breaking SEO defects the launch gate does not check for.

---

## P0 — Cutover breakers the launch gate does not catch

`production/data/launch-readiness.json` reports 7 blockers: `redirect_reviews`,
`external_seo_exports`, `listing_quality_review`, `live_services`, `monitoring_rollback`,
`payload_runtime`, `production_recovery`. None of the following is among them.

### 1. Every image breaks at cutover — no media migration exists

All 4,978 media references in `cms-seed.json` point at the **legacy WordPress origins**:

```
makler-realty.com  3324
makler-realty.ru   1654
```

The new app has no `/wp-content/uploads/*` route (`app/` contains no such handler), no object
storage, no CDN, and no script that downloads the originals. `loadMediaInventory()`
(`production/lib/cms-seed.mjs:15`) parses a CSV of *URLs* from the crawl — the bytes were never
copied.

The moment DNS points `makler-realty.com` at the new app, every listing gallery, thumbnail, and
`og:image` 404s. `SOURCE_OF_TRUTH.md` §13 registers this exact risk ("`/wp-content/uploads/` 404s →
Preserve media paths or 301 old uploads") — the mitigation was never built and the gate does not
test it.

The in-flight Next image-optimizer work (`next.config.mjs` `remotePatterns` for both hosts) makes
this *worse*: it hardens the dependency on the legacy origins instead of removing it.

**Fix:** mirror all 11,859 media rows to owned storage before cutover, or serve
`/wp-content/uploads/*` from the new app at the original paths. Add a launch check that samples N
image URLs against the new origin.

### 2. The homepage 404s on both domains

```
GET / (Host: makler-realty.com) → 404
GET / (Host: makler-realty.ru)  → 404
```

`app/` has no root `page.js`/`route.js`, and `deployable-redirects.json` contains **zero** decisions
for `https://makler-realty.com/` or `https://makler-realty.ru/` — both roots sit in the 292
unreviewed URLs. The most-linked, highest-authority URL on two 13-year-old domains has neither a
product route nor a redirect decision.

**Fix:** add a root route that language-negotiates to `/{locale}` (302, not 301 — content
negotiation must not be cached as permanent), independent of the redirect-review backlog.

### 3. `.ru` is not first-class — one hardcoded origin for two domains

`production/lib/seo-files.mjs:15`:

```js
export const DEFAULT_PUBLIC_ORIGIN = process.env.MS_REALTY_PUBLIC_ORIGIN || "https://makler-realty.com";
```

Both domains serve the same app from the same process. Consequences, all verified against the
served output:

- `robots.txt` on `makler-realty.ru` advertises `Sitemap: https://makler-realty.com/sitemap.xml`.
- `sitemap.xml` `<loc>` entries are all `https://makler-realty.com/...` — **`.ru` has no sitemap of
  its own**.
- No host-based routing anywhere; `.ru` and `.com` return byte-identical HTML for the same path.

§13 rule 4 and §18 both make `.ru` first-class non-negotiable. At the SEO layer it is a mirror of
`.com`.

**Fix:** derive origin per request from the `Host` header; emit a per-domain sitemap and robots;
route `.ru` to the RU locale tree.

### 4. hreflang, canonical, and `og:url` are relative URLs

Served `<head>` on `/bg`:

```html
<link rel="alternate" hreflang="en" href="/en">
<link rel="canonical" href="/bg/imoti/MS-CRAWL-0001">
<meta property="og:url" content="/bg/imoti/MS-CRAWL-0001">
```

- **hreflang requires absolute URLs.** Relative `href` values are invalid and silently ignored by
  Google. The entire multilingual signal — the core of the rebuild — is void in the served HTML.
  (The *sitemap* emits them correctly, so the two disagree.)
- **Relative canonical + two domains = self-canonicalisation on both.** `.com` and `.ru` each
  canonicalise identical content to themselves → cross-domain duplicate content.
- **`og:url` must be absolute.** WhatsApp/Viber/Facebook share previews — a first-class conversion
  path per §18 — will not resolve.

**Fix:** same as #3; absolutise all three against the per-request origin.

### 5. EN / DE / NL have zero listing content

Actual translation state in `cms-seed.json`:

```
bg:published 113   ru:published 52   el:approved 1   he:approved 1
en: 0   de: 0   nl: 0
```

`locales/registry.json` marks all seven as `public_enabled + indexable`. The generated sitemap is
**197 URLs against a 457-URL legacy baseline**, split:

```
bg 118 · ru 56 · (root) 7 · el 4 · he 4 · en 4 · de 2 · nl 2
```

EN/DE/NL get only home/search/seller/contact — no listings, no locations. The legacy `.com` site has
live `/en/`, `/de/`, `/nl/` trees. §13's risk register names this precisely ("Shipping fewer
languages than today → every existing translation ported before launch; per-locale word-count
diff"); the diff was never built and the gate does not check locale parity.

Practical effect today: `/he/search` renders an RTL Hebrew shell listing properties titled in
Cyrillic Bulgarian.

**Fix:** add a per-locale content-parity gate to `launch-readiness`; either port the legacy EN/DE/NL
translations or set those locales `indexable: false` until they have content.

---

## P0 — Security

### 6. There is no login. The proxy authenticates everyone.

`production/Caddyfile.local-production`:

```
@operator path /admin/* /api/admin/*
reverse_proxy @operator app:3000 {
  header_up Authorization "Bearer {$MS_REALTY_ADMIN_TOKEN}"
}
```

Every request to `/admin/*` gets the admin bearer token attached by the edge. There is no session,
no password, no per-user identity. Anyone who can reach the edge is a full admin.

`docker-compose.local-production.yml` sets `MS_REALTY_ADMIN_ACTOR: local_preview`, so every audit-log
entry, every approval, every mutation is attributed to one shared pseudo-operator. The entire
`ROLE_CAPABILITIES` / `requiredAdminCapability` model in `production/lib/admin-auth.mjs` — roles,
capabilities, `bindAuthenticatedOperator`, per-operator token registry
(`MS_REALTY_ADMIN_CREDENTIALS_JSON`) — is well-built and **completely unreachable in the only
deployment that exists**.

This directly contradicts §16 P3's "attributable role-scoped mutations" and §11.5's "Internal users
must see that a draft came from Hermes… every action attributable".

**Fix:** real sessions. Payload already ships an auth-enabled `admins` collection
(`payload.config.js`) with the right four roles — wire the admin surface to it and delete the header
injection.

### 7. Full admin takeover by CSRF

There is **no Origin, Referer, Sec-Fetch-Site, or CSRF-token check anywhere** in the codebase
(verified by grep across `production/lib`). Combined with #6:

```
POST /api/admin/tours/approve
  Origin: https://evil.example
  Content-Type: application/x-www-form-urlencoded
→ 400 (reached the handler; auth and capability checks passed)
```

The 400 is body validation — the request was *authenticated*. Admin endpoints accept
`application/x-www-form-urlencoded` (`app-admin-adapter.mjs:401`) and fall through to `JSON.parse`
for any other content type, so a plain cross-origin `<form>` — no CORS preflight, no JS — can drive
any admin mutation: approve tours, publish translations, change listing status, close deals,
withdraw consent, export the redirect map.

**Fix:** reject non-same-origin state-changing requests (`Sec-Fetch-Site` + `Origin` allowlist), and
require `application/json` on every admin write.

### 8. Hard-coded admin token active outside production

`production/lib/admin-auth.mjs:189`:

```js
const token = env.MS_REALTY_ADMIN_TOKEN || (env.NODE_ENV === "production" ? "" : LOCAL_ADMIN_TOKEN);
```

Verified:

```
resolveAdminPrincipal("Bearer local-admin-smoke", {})
  → { id: null, source: "shared_token", can_mutate: true, roles: ["admin"] }
```

`package.json` `"start": "node production/server.mjs"` sets no `NODE_ENV`, and `README.md` documents
`npm start` as *the* run command. Any host started that way exposes full-mutation admin under a
token that is public in this repository. (The Docker path sets `NODE_ENV=production` and is safe.)

**Fix:** fail closed — refuse to start without an explicit token, and gate the fallback on
`NODE_ENV === "test"` rather than `!== "production"`.

### 9. Rate limiter bypassed by a header

Verified live against `/api/events`:

```
35 requests →  27×201, 8×429
1 request with X-Forwarded-For: 1.2.3.4 → 201
```

`clientIpFromHeaders` (`production/lib/rate-limit.mjs`) trusts the first `X-Forwarded-For` entry
unconditionally, with no trusted-proxy configuration. The server binds `0.0.0.0` by default, so the
header is client-controlled. This is the only defence on four unauthenticated write endpoints
(`/api/leads`, `/api/events`, `/api/saved-searches`, `/api/language-requests`), each of which appends
to disk — so it is also the only defence against lead spam and unbounded disk growth. No captcha, no
proof-of-work, no bot check.

**Fix:** only honour `X-Forwarded-For` from a configured trusted-proxy CIDR; otherwise use the socket
address.

### 10. Fail-open secrets in `payload.config.js`

```js
secret: process.env.PAYLOAD_SECRET || "ms-realty-local-payload-secret",
connectionString: process.env.DATABASE_URL || "postgres://payload:payload@127.0.0.1:5432/ms_realty",
```

A missing `PAYLOAD_SECRET` in production silently signs admin JWTs with a secret published in this
repo. The `payload_runtime` launch gate does catch the placeholder — but the gate is advisory, the
default is not.

**Fix:** throw when the env vars are absent and `NODE_ENV === "production"`.

### 11. Four high-severity dependency CVEs, and an override that pins the vulnerable version

```
postcss <=8.5.17  HIGH  arbitrary file read / path traversal via sourceMappingURL
sharp   <0.35.0   HIGH  libvips CVE-2026-33327/33328/35590/35591
6 vulnerabilities (2 low, 4 high)
```

`package.json` `overrides` pins `postcss: 8.5.10` — **below** the fixed version, actively holding the
vulnerable build. CI (`.github/workflows/ci.yml`) runs no `npm audit`, no CodeQL, no secret scan.

### 12. Security-header gaps

- **No CSP on admin HTML in the Next runtime.** `CONTENT_SECURITY_POLICY` is applied in
  `http.mjs:210` (bare Node server) and in `app-router-adapter.mjs` (public pages), but
  `app-admin-adapter.mjs`'s `PRIVATE_HTML_HEADERS` omits it entirely. The deployed admin has no CSP;
  the non-deployed server does. A concrete instance of the dual-runtime divergence in #13.
- **No HSTS** anywhere in the repo.
- CSP itself keeps `script-src 'unsafe-inline'` (documented as a nonce-plumbing gap) — acceptable
  short-term, but it means CSP provides little XSS protection today.

---

## P1 — Architecture

### 13. Two runtimes implement the same surface

| Surface | Bare Node | Next App Router |
|---|---|---|
| Router | `http.mjs` (3,173 lines, if-chain) | `app-admin-adapter.mjs` (2,412) + `app-api-adapter.mjs` (517) + `app-router-adapter.mjs` |

~6,100 lines of routing maintained twice. Credit where due: `http-admin-surface-parity.test.mjs` and
`app-route-parity.test.mjs` guard against drift, which is more discipline than most codebases apply.
But parity tests check *route presence*, not *behaviour* — and the CSP gap in #12 is a live
divergence that slipped through.

Only one of the two is deployed (`Dockerfile` runs `next start`). The bare server exists for smoke
tests and `npm start`.

**Fix:** make `production/lib/*` pure request→response handlers with one router, and reduce both
entry points to thin transports. Or delete the bare server and run smoke tests against Next.

### 14. Payload CMS and PostgreSQL are disconnected from the product

Nothing outside `app/(payload)/*` imports `payload` or touches Postgres — verified across
`production/lib`, `production/scripts`, and `app/`. The public site, search, listings, leads, and CRM
all read `production/data/cms-seed.json` (3.3 MB) plus JSONL edit ledgers.

There are two content systems that cannot see each other, with no sync in either direction:

1. **Payload 3.85 + Postgres** — real DB, versioned migrations, generated collections, admin at
   `/payload-admin`. Nothing consumes it.
2. **The actual product** — JSON seed + JSONL ledgers, served by `production/lib`.

Editing a listing in the Payload admin has zero effect on the public site. `SOURCE_OF_TRUTH.md` §16
marks P3 "CMS & CRM" as *Implemented* — accurate for the file-based admin, but a reader will assume
Payload is the CMS. The "two disconnected content systems" problem is not named as a blocker
anywhere.

**Fix:** pick one. Either make Payload the write path and generate the seed from it, or drop Payload
and stop carrying an unused Postgres + migration surface.

### 15. The database is JSONL files, and one torn write is permanent data loss

`production/lib/sqlite-ledger.mjs` writes JSONL first, then mirrors into SQLite. Three consequences:

- **`fs.appendFileSync` is not atomic above `PIPE_BUF` (4 KB).** Lead rows carry nested `property`,
  `requirements`, and `intake_completion` objects and can exceed that. Two concurrent writers
  interleave partial lines.
- **`parseJsonl` has no error handling** — `.map((line) => JSON.parse(line))`. A single torn or
  truncated line throws, and because JSONL is the source of truth, **the entire ledger becomes
  permanently unreadable**. No quarantine, no skip, no recovery.
- **Any foreign write triggers a full O(n) rebuild.** `ensureFresh` compares an mtime+size signature
  and calls `rebuildDbFromRows` on mismatch — so a script appending one row makes the web process
  re-import the whole ledger on its next read.

SQLite sits *behind* JSONL rather than replacing it, so it adds a layer without solving durability,
atomicity, or concurrency.

**Fix:** make SQLite the source of truth (WAL already gives you atomicity and cross-process safety);
demote JSONL to an export. If JSONL must stay authoritative, wrap `JSON.parse` per line with
quarantine-and-continue.

### 16. Single-node by construction

- Rate limiter: in-process `Map`, module-global singleton (`app-api-adapter.mjs:191`) — a second
  instance multiplies every limit.
- File cache: in-process `Map` keyed on mtime+size.
- All state: local disk, one Docker named volume (`local-dev-app-data`), no replication.

Two app replicas would corrupt ledgers (#15) and multiply rate limits. Horizontal scaling and
zero-downtime deploys are both blocked.

### 17. O(n) work on hot paths

- `resolveRuntimePath` (`runtime.mjs:119`) linearly scans every listing per request, calling
  `mergeRuntimeTranslations` — which iterates the whole translation ledger — for each one.
  O(listings × translation-ledger) per page view.
- `withLeadContacts` → `readPrivateContacts` **decrypts the entire contact vault** on every admin
  leads request, holding all PII in memory.
- The 3.3 MB `cms-seed.json` is parsed and folded through edit + media ledgers per cache miss.

Fine at 165 listings. Not fine at 2,000.

---

## P1 — Data model

### 18. Core listing facts are empty

Measured across all 165 listings:

| Field | Populated |
|---|---|
| `area_sqm` | **0 / 165** |
| `listing_status` | **0 / 165** (all default to `available` in code) |
| coordinates | **none — field does not exist** |
| `bedrooms` | 82 / 165 |
| `price_eur` | 137 / 165 (+28 price-on-request) |
| `seo.human_approved` | **0 / 165** |

Downstream effects:

- The **area facet** required by §9 and the "area/rooms/floor/land" listing requirement in §6 have
  no data to filter on.
- The **sold/reserved/archived-but-live strategy** — a pillar of the §13 migration plan and the
  stated way to keep 13 years of long-tail equity — has no source data. Every listing renders as
  available.
- §16 claims "every public fact and translation has an accountable human approval"; SEO approval is
  zero.

### 19. No maps, anywhere

MapLibre GL JS is a named stack decision (§4) and a core public requirement (§6: "list/map split
desktop"). There is no map implementation, no geo library, and no latitude/longitude in the data
model. `public-site.mjs:1715` acknowledges it: *"Listing coordinates are not reviewed yet. Do not
expose a map switch"*. Honest — but the gap is invisible in the phase table, which marks P2
"Implemented".

### 20. Listing URLs discard the legacy SEO signal, and are case-sensitive

```
/bg/imoti/MS-CRAWL-0001  → 200
/bg/imoti/ms-crawl-0001  → 404
```

Legacy URL: `/listing/авторемонтна-работилница-мотел-и-вед/` — keyword-rich Cyrillic slug.
New URL: `/bg/imoti/MS-CRAWL-0001` — a crawl-artifact ID with zero keywords.

Two problems:

1. §13's decision preference is "**keep same URL** → 301 to exact equivalent → …". By using crawl IDs
   as slugs, *every one of the 457 URLs* is forced into the 301 branch by construction. The most
   valuable option was designed away.
2. Uppercase, case-sensitive path segments. Google treats the two cases as distinct URLs; any link
   that gets lowercased in transit (mail clients, forums, some CMSes) 404s.

**Fix:** slug history already exists (`slug-history.mjs` generates automatic 301s) — use it to move
to lowercase keyword slugs derived from the legacy path, and add a case-insensitive redirect.

---

## P1 — Product & features

### 21. Nothing sends anything

No SMTP, nodemailer, SendGrid, Twilio, WhatsApp, or SMS integration exists anywhere in the repo
(verified by grep). §12 lists "SMTP/email delivery" as **required**. Every "automation" in §12 is a
report plus manual work:

| Claimed | Actual |
|---|---|
| Inquiry → "instant confirmation" | `confirmation.status: "ready"` on the page. No message sent. |
| Saved search → new-match alert | A JSON report. The buyer is never contacted. |
| Missed SLA → reminder → escalation | Broker tasks inside a report. No notification. |
| Broker reply | `reply-outbox.jsonl` status `queued_for_manual_send`; broker copy-pastes, then logs `sent` in `reply-delivery-outcomes` |

The platform is a system of record with no system of engagement. For a business whose #1 competitive
claim is **speed-to-lead**, every outbound touch is manual.

### 22. No public form captures an email address

Verified across `/bg/imoti/*`, `/bg/kontakt`, `/bg/prodai` — every enquiry, callback, viewing, and
valuation form collects exactly:

```
contact.name (required) · contact.phone (required, type=tel) · message · contact_preference
```

`contact_preference` options: **Phone / WhatsApp / Viber**. No email input anywhere. The only
`type="email"` field in the codebase (`react-public-site.mjs:1176`) belongs to the saved-search alert
form.

This directly undercuts the highest-margin lane. A German or Dutch buyer researching from abroad
must either place an international call or use a `mailto:` link that bypasses the CRM entirely — no
lead record, no SLA timer, no consent record. Requiring a phone number for a simple question also
sits badly against §15's "short forms, no forced signup before inquiry".

### 23. No idempotency on lead submission

Verified: submitting the identical lead twice returns `201` both times, creating two leads, two SLA
tasks, and two consent records. The ledger flags `duplicate_status: possible_duplicate` after the
fact, but nothing prevents it. Double-submit on a slow mobile connection is exactly the behaviour
§15 designs for.

**Fix:** accept a client-generated idempotency key, or dedupe on
`contact_fingerprint + listing + 5-minute window` before the append.

### 24. GDPR gaps for an EU business handling buyer/seller PII

- **No erasure path.** The vault is append-only JSONL and the SQLite ledgers install
  `BEFORE DELETE … RAISE(ABORT, 'ledger is append-only')` triggers. Article 17 right-to-erasure is
  structurally unimplementable. `createConsentWithdrawal` records a withdrawal — it does not delete
  the contact.
- **No retention policy or TTL** on any ledger.
- **Google Fonts hotlinked** from `fonts.googleapis.com` on every public page. German courts have
  ruled that embedding Google Fonts without consent violates GDPR; DE and NL are target locales.
  Self-host the two font files.
- **No key rotation** path for `MS_REALTY_LEAD_CONTACT_KEY`; the vault is a single-key blob.

Credit: the vault crypto itself is correct — AES-256-GCM, random 12-byte IV, subject-bound AAD,
`0o600`, no raw contact in the lead ledger (enforced by `assertLeadLedger`). The gap is lifecycle,
not cryptography.

---

## P2 — Frontend, UX, accessibility

### 25. Heading order violates WCAG 1.3.1 on search pages

Rendered heading sequence on `/bg/tarsene` and `/he/search`:

```
h2 (Филтри) → h3 (Филтри) → h1 (Търсене на имоти) → h2 …
```

The filter panel emits `h2` and `h3` *before* the page `h1`. Also on the search page: **18 `<input>`
elements with no `id`**, so their labels cannot be programmatically associated.

Otherwise the rendered HTML is good: correct `lang`/`dir` (`he` → `dir="rtl"` verified), single `h1`
per page, `alt` on all 39 listing images, valid `RealEstateListing` JSON-LD, `tel:` links, skip link,
`aria-live` regions, real pagination (no infinite scroll), 12-card list-first layout.

### 26. The accessibility gate tests a mockup, not the product

`qa/mobile_elderly_static_check.py` (109 lines) validates:

- string markers inside `makler-realty-design-system/project/ui_kits/remaining/index.html` — a
  **static design-system file**;
- keys in `locales/registry.json`;
- CSV row counts in the crawl artifact.

It never renders or inspects a single production page. It passes while the shipped search page has
the heading-order violation above. "WCAG 2.2 AA" (§15, an explicit non-negotiable gate) is asserted
against a mockup.

**Fix:** run axe-core against the rendered fixtures already produced by `npm run public:build`.

### 27. Page weight

| | raw | gzip |
|---|---|---|
| `/bg` | 101 KB | 46 KB |
| `/bg/tarsene` | 136 KB | 49 KB |
| listing | 116 KB | 47 KB |

Plus a **186 KB monolithic CSS** shipped to every public page (it also contains the admin styles),
41 KB public JS, and 624 KB of Photo Sphere Viewer on tour pages. Gzip keeps it survivable, but for
"phone-first, older users, bright mobile conditions" the HTML is 2–3× heavier than it needs to be —
most of it is the fully-expanded filter panel and 12 inlined cards.

### 28. Smaller items

- **No `Organization` / `RealEstateAgent` / `LocalBusiness` JSON-LD on the homepage.** Listing pages
  have `RealEstateListing`; the agency itself has no schema. Basic local-SEO miss for a
  single-location business.
- **`HEAD` returns 405.** Uptime monitors and some CDNs use HEAD.
- **Fixture text in production content.** `MS-CRAWL-0001`'s meta description and `og:description` are
  literally `"Updated approved source description."` — a seeded demo edit in the committed
  `listing-edits.jsonl` that renders on a live page.

---

## P2 — Process

### 29. No static analysis on 37.7k lines

No ESLint, no Prettier, no type checking, no JSDoc/`checkJs`. CI runs `npm run check` only. For a
codebase this size with zero types, that is the single cheapest quality win available.

### 30. `npm run validate` is one 45-command shell line

A single `&&` chain in `package.json`. No parallelism, no partial re-run, no per-step timing — and a
failure at step 40 re-runs 39 steps to retry. Move it to a script with named stages.

### 31. Documentation drifts optimistic in exactly the places that matter

`SOURCE_OF_TRUTH.md` is unusually honest overall — it names its own blockers and says "the code
wins". But the phase table marks P2 and P3 "Implemented and browser-audited locally" without noting
that: there is no media host, no message sender, no map, no session auth, and no Payload↔product
connection. A reader takes "Implemented" to mean the subsystem works end-to-end.

---

## What is genuinely good

Worth stating plainly, because the findings above are dense:

- **490 passing tests across 98 files**, including dual-runtime parity guards. Real discipline.
- **Append-only ledgers with SQLite triggers** and JSONL audit mirrors — the right instinct for an
  auditable CRM.
- **Contact vault crypto is correct**: AES-256-GCM, subject-bound AAD, `0o600`, no raw PII in the
  lead ledger (structurally enforced).
- **The launch gate is honest.** `launch_ready: false` with 7 named blockers, and
  `production_recovery` explicitly refuses to accept a local Docker snapshot as DR evidence. Most
  projects fake this.
- **Rendered HTML quality is high**: correct `lang`/`dir`, RTL Hebrew, single `h1`, full `alt`
  coverage, valid JSON-LD, real pagination, no infinite scroll, `noindex` on filtered search.
- **CI runs the full check on every PR.**
- **Zero-JS-first rendering** with a hand-rolled React-to-string renderer that strips `on*` props —
  an unusual choice, but coherent and fast.

---

## Suggested order

**Before any cutover conversation:**

1. Media migration (#1) — mirror 11,859 assets to owned storage.
2. Real session auth (#6) + CSRF defence (#7) — wire the existing Payload `admins` collection.
3. Absolutise canonical/hreflang/`og:url` and derive origin per host (#3, #4).
4. Root route for both domains (#2).
5. Fail-closed secrets and the `local-admin-smoke` fallback (#8, #10); trusted-proxy IP handling (#9).

**Before calling the CRM usable:**

6. An actual email/WhatsApp sender (#21) and email capture on enquiry forms (#22).
7. Decide Payload-or-not (#14); make SQLite authoritative (#15).
8. Locale content-parity gate (#5) and listing-status/area backfill (#18).

**Ongoing:**

9. ESLint + `npm audit` in CI (#11, #29); axe-core against rendered pages (#26).
10. GDPR erasure + retention + self-hosted fonts (#24).
