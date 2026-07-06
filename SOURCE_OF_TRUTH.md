# MS Realty — Source of Truth

**Single canonical document for the MS Realty rebuild** (`makler-realty.com` + `makler-realty.ru`).
Last updated: 2026-07-05.

> **Precedence.** Running code, crawl artifacts, generated `production/data/*`, and the
> subsystem READMEs (`production/`, `migration/`, `search/`, `locales/`,
> `makler-realty-design-system/`) are authoritative. Where this document and the code
> disagree, the code wins and this document is corrected. This file replaced eight
> overlapping planning docs (strategy, end-state ×2, SEO requirements, research, language
> coverage, execution status, build/migration blueprint) so there is exactly one narrative truth.

---

## 1. What MS Realty is

MS Realty is a family real-estate agency in **Sandanski, Bulgaria** (SW Bulgaria; spa town, near
the Greek border). The rebuild turns a 13-year-old WordPress/qTranslate-X site into a
**multilingual, SEO-safe, phone-first property-search and broker-operations platform** — a real
operating system for buyers, sellers, and brokers, not a redesigned brochure site.

The single hard constraint: **the domains' 13-year search equity is the asset.** The rebuild must
preserve every indexed URL first, then add product on top.

---

## 2. Market strategy & positioning (the *why*)

**Don't build another portal.** MS Realty cannot beat imot.bg / homes.bg / imoti.net on volume, and
shouldn't try. The Bulgarian market is dominated by classified portals that act as advertising
boards — high volume, low trust (duplicate/bait listings, "from" prices, no accountability). Agency
sites are mostly brochureware. Even the largest foreign-buyer specialist sits at a "Poor" Trustpilot
score on an unclaimed profile. **Trust is the category no incumbent owns.**

The defensible position sits *between* the volume portals (reach, zero trust) and traditional
agencies (service, zero digital): a **verified, transparent, fast, content-rich, multilingual**
platform that behaves like modern proptech but delivers real local service.

**Five pillars:** Verified · Transparent · Fast · Bilingual/multilingual · Local-expert.

**Three revenue engines:**
1. **Local buy/sell commission** — higher-intent leads captured on owned listing pages, converted
   with speed-to-lead, instead of paid portal placements.
2. **Foreign-buyer concierge** — the highest-margin lane. Structural gaps make it defensible and worth
   paying for (see verified facts below).
3. **Seller listings won via valuation** — a free "request a valuation" intake, on every page, is the
   most proven seller-lead engine in the global playbook. (Not a public AVM — see §12.)

**Verified market facts (durable, each a product surface):**
- Non-EU buyers cannot own land in their own name — they need a Bulgarian company (OOD); EU/EEA can.
- Even Bulgaria's largest bank markets no standard mortgage to foreign nationals — a real financing gap.
- Properties are sold with undisclosed mortgages/liens that surface only after a deposit — a
  title/encumbrance-check product.
- Native listing pages (not portal iframes) own SEO authority.
- An on-every-page valuation request is the proven seller-lead engine.

*(Refuted and excluded during research: "88% abandon poor-UX sites," "75% of traffic is mobile" —
unsourced, not used.)*

---

## 3. Ground-truth facts (from the crawl + registry)

Authoritative crawl artifact: `migration/artifacts/20260704-211155/` (generated 2026-07-04, 150s,
0 fetch failures, 0 homepage redirect targets).

**Two live domains — both first-class:**
- `makler-realty.com` — multilingual main domain. Legacy WordPress sitemap index at `/sitemap.html`
  (74 sub-sitemaps back to 2013). Language structure includes `/en/`, `/de/`, `/nl/`, and root/BG.
- `makler-realty.ru` — an **active Russian site, not a parked redirect.** Yoast sitemap index at
  `/sitemap_index.xml` (11 sub-sitemaps: post, page, listings, category, post_tag, category_type,
  resort, floors, location, property, type). `.ru` stays first-class Russian unless the business makes
  an explicit consolidation decision.

**URL universe — 457 URLs total:**

| Metric | Count |
|---|---|
| Total URLs | **457** (all HTTP 200) |
| `.com` URLs | 278 |
| `.ru` URLs | 179 |
| Listings | **165** |
| Taxonomy pages | 146 |
| Informational pages | 104 |
| Blog posts | 42 |
| Media rows | **11,859** |

**Metadata gaps to fix during migration:** 181 missing meta descriptions, 57 missing H1, 457 with no
detected schema (0 missing titles, 0 zero-image pages).

**Languages — registry-driven (`locales/registry.json`), not a fixed list:**
- **Source/editorial locale:** BG.
- **Admin CMS/CRM locales:** exactly **BG, RU, EN** (locked by `required_admin_locales`).
- **Seeded public website locales:** **BG, EN, DE, NL, RU, EL (Greek), HE (Hebrew, Israel)** (locked by
  `required_public_locales`; `website_language_coverage` maps Greece→`/el/`, Israel→`/he/`).
- **Hebrew is RTL** and must pass layout QA before launch. **French (`fr`)** is a disabled example for
  the fallback/request flow.

---

## 4. Target stack (the decision, with evidence)

Decided after reviewing open-source real-estate CMS/CRM projects and running a real-data
crawl/search spike — **not** by framework taste. **Executive decision: do not fork a legacy
real-estate CMS.** Build a domain-specific platform from modern open-source blocks.

| Layer | Choice | Notes |
|---|---|---|
| Public app | **Next.js** (App Router), server-rendered/static | SEO-first; indexable content must render without JS |
| CMS / admin | **Payload CMS**-style, code-first TypeScript content model | Directus is the fallback if no-code DB admin becomes the priority |
| Database | **PostgreSQL** | Canonical business data; keep Property identity separate from Listing publication |
| Search | **Typesense or Meilisearch** | Both prototyped with real data; final pick after BG/RU transliteration + geo + rebuild-speed testing |
| Maps | **MapLibre GL JS** | No Google billing; Google optional only for geocoding if justified |
| 360 tours | **Photo Sphere Viewer** (Pannellum/Marzipano as fallbacks) | Gated approval overlay; WebGL fallback gallery required |
| Video | **Video.js + HLS.js** | Where adaptive playback is needed |
| Workers/queues | App-owned queues | Imports, sitemap gen, media processing, saved-search alerts, stale checks, CRM reminders, AI jobs |
| Automation (non-critical) | **n8n**, self-hosted, locked down | Internal experiments only — never the source of truth |
| AI | **Hermes Agent** — self-hosted Nous Research **open-weight Hermes models** + Hermes function-calling format (model-agnostic seam) | Draft-only assistant; read-only retrieval over approved CMS content; schema-validated JSON outputs; human approval; full audit logs. Full spec in §11 |
| Locales | Admin-managed dynamic registry | Hermes drafts; humans approve; RTL support before Hebrew launch |

The current app is a **hybrid production foundation**: `production/` keeps the dependency-light
executable contracts for URL/locale/AI/lead/migration policy, while `app/` exposes those contracts
through Next.js App Router route handlers that pass `next build`. It is still **not** the final app:
the React public UI and Payload CMS collections remain to land on top of these contracts.

**OSS reference set (learn-from, don't fork):** PropertyWebBuilder, Open Real Estate CMS,
MicroRealEstate, EspoCRM real-estate extension (domain models); Twenty, Frappe CRM, EspoCRM, SuiteCRM
(CRM UX/objects); Payload, Directus, Strapi, Wagtail (CMS + accessibility); Typesense, Meilisearch
(search); MapLibre; Photo Sphere Viewer, Pannellum, Marzipano, Video.js, HLS.js (media). Accessibility
grounded in GOV.UK Design System, USWDS, WCAG 2.2, NN/g older-adult usability.

---

## 5. Data model

Minimum stable entities (keep **property identity separate from listing publication** — a property
can have several listings/status changes over time, but old public URLs still need stable handling):

`Property` · `Listing` · `ListingTranslation` · `MediaAsset` · `Location` · `TaxonomyTerm` · `Agent` ·
`Contact` · `Lead` · `Deal` · `Viewing` · `SavedSearch` · `Inquiry` · `Communication` · `Task` ·
`Redirect` · `SeoMetadata` · `SitemapUrl` · `MigrationSnapshot` · `Consent` · `AuditLog`.

---

## 6. Public website

**Core surfaces:** homepage (Buy · Rent · Sell · Invest · Foreign buyers); property search (list-first
mobile, list/map split desktop); listing detail; city/resort pages (Sandanski, Bansko, Blagoevgrad,
Petrich, Sveti Vlas, Sunny Beach, Melnik, Nafplio, Thessaloniki/Halkidiki); property-type pages
(apartments, houses, villas, land, commercial, hotels, offices, industrial); buyer/seller/rental/
landlord/investment guides; foreign-buyer section (multilingual process, taxes/fees, documents, remote
purchase, FAQ); agent profiles; about/partners/services/contacts/privacy/legal; resource center.

**Every listing page needs:** stable URL or 301 from the old URL · property ID · status
(available/reserved/sold/rented/archived) · sale/rent type · price + currency · area/rooms/floor/land ·
category · resort/location · full translated description · gallery with captions/alt text · map area or
approximate-location privacy · updated date + verification signal · broker/contact owner · phone /
WhatsApp / Viber / email / viewing request · similar listings · sticky mobile actions (Call, Viber/
WhatsApp, Ask, Save) · printable/shareable PDF (`?print=1`) · send-to-family share · `RealEstateListing`
JSON-LD + breadcrumbs + canonical + hreflang + Open Graph.

**Location/taxonomy pages:** editorial guide content + live listing blocks + crawlable pagination +
canonical/hreflang control. A locale-prefixed location page is generated **only** when that locale has
≥1 indexable listing there; empty locale-location pairs return noindex/404 (no thin pages).

---

## 7. CMS & property editor

**Content types:** Listing · Listing media · Location/city/resort · Property category/type ·
Agent/broker · Guide/article · Landing page · FAQ · Market report · Testimonial/case study ·
Translation object · Redirect rule.

**CMS capabilities:** draft/review/publish; scheduled publish/unpublish; listing-status workflow;
per-language translation workflow; per-language SEO fields (title, description, canonical, OG, robots);
**slug history with automatic 301 creation**; media library with compression, alt text, and preserved
source paths; bulk import/export for migration; role-based permissions (admin, broker, editor,
translator); audit log for every content/listing change.

**Property editor:** core facts; price/area/rooms/condition/status; approximate-location privacy
control; availability + verification/updated-date workflow; translation tabs from the locale registry
with per-locale states (**missing → Hermes drafted → human edited → approved → published → stale**);
SEO panel with schema readiness; media manager (photo/video/floor-plan/360); listing-quality checklist;
publish-approval state; AI draft suggestions with accept/reject controls. Admin UI is BG/RU/EN only.

---

## 8. CRM & broker workspace

**Lead types:** buyer · seller · renter · landlord · investor · foreign buyer · general inquiry ·
partner/referral.

**CRM objects:** Contact · Account/family/company · Lead · Deal/opportunity · Property interest ·
Viewing · Task · Communication thread · Document checklist · Saved search · Consent record.

**Workflow:** every inquiry creates a lead with source, language, property ID, budget, location
interest, timeline, and preferred channel. Broker assignment by language/location/type or manual
override. SLA timer starts immediately; automatic follow-up if no broker action in the configured
window. Duplicate contact detection.

**Pipelines:**
- **Buyer:** new → qualified → viewing booked → viewed → offer → due diligence → contract → closed / lost.
- **Seller:** valuation requested → contacted → appraisal → mandate signed → listing prepared →
  published → offer → closed.
- **Renter:** inquiry → qualified → viewing → application → lease → closed.

**Broker workspace (task-driven, not analytics-first):** Today dashboard (new leads, overdue tasks,
viewings, hot buyers, stale listings); lead inbox with language/source/property/budget + AI summary;
buyer-requirements-vs-inventory matching; viewing calendar + reminders + `.ics` export; listing-quality
checklist; bulk sold/rented/reserved updates; comms templates for phone/WhatsApp/Viber/email; activity
timeline per contact and property; commission/process notes visible to authorized roles only; reports
for lead volume, response time, source quality, and stale tasks. Real-estate-specific and compact —
**not** a generic enterprise CRM clone.

---

## 9. Search

Built on the **real migrated listing corpus first**, then enriched from the production CMS.

- Instant text search; facets for location, property type, price, bedrooms, area, status, language.
- Typo tolerance; **Bulgarian/Russian search-quality testing**; transliteration handling.
- Saved searches; new-match and price-change alerts; similar listings.
- Zero-result and popular-filter analytics.
- Locale-scoped queries; reviewed-translation/fallback markers; RTL-safe result cards.

**Typesense and Meilisearch both remain valid** — final choice only after live import/query testing
with the migrated corpus. Keep vector/semantic search separable so the engine can be swapped.
*(Current crawl metadata lacks reliable structured price/area — those fields stay nullable until the
source CMS or enriched extraction fills them; production search ranking must not depend on them yet.)*

---

## 10. Media, video & 360 tours

Pipeline supports: photo gallery + alt-text workflow; **broker/editor moderation before publish**;
floor plans; short vertical video; long walkthrough video; **360 panorama via Photo Sphere Viewer**;
optional multi-room hotspot tours; low-bandwidth mobile behavior. **WebGL fallback is mandatory** — a
normal gallery and accessible caption must always work.

First production implementation is the **gated approval overlay**: imported listings start with draft
tour fields; only reviewer-approved panorama rows become public Photo Sphere Viewer mounts. Imported
crawl media is normalized into public gallery candidates; floor-plan/video/tour assets stay
review-gated until explicitly approved. No unreviewed crawl media is published as a public 360 panorama.

---

## 11. AI layer — the Hermes Agent

The AI layer is named after, and built on, **Nous Research's open-source Hermes system**. It is
**assistive, never authoritative**, added **after** deterministic workflows exist. The engine and
contracts below are the Phase-5 specification the current `Hermes*` guardrails target — they define the
chosen system, not an already-wired model. Hermes is chosen because it lets the assistant be:

- **Self-hosted on the EU box** — owner/buyer PII never leaves the platform (GDPR; §18).
- **Open-weight** — no per-token vendor lock; the model-agnostic seam is a config change, not a rewrite.
- **Natively structured** — Hermes speaks a function-calling + JSON/Pydantic-schema format that fits
  this repo's draft-only, deterministically-validated contracts exactly.

### 11.1 Engine — open-weight Hermes models
| Role | Model | Why |
|---|---|---|
| **Default (self-hosted)** | `NousResearch/Hermes-4-14B` (Qwen3-14B base) — FP8 build `Hermes-4-14B-FP8` | Apache-2.0-friendly base, strong multilingual (BG/RU/DE/NL/EL/HE), runs on one modest GPU; hybrid reasoning, function calling, JSON/structured outputs |
| **Quality step-up** | `Hermes-4.3-36B` (Nov 2025) or `Hermes-4-70B` (Llama-3.1 base) | When a task needs more capability; GGUF/FP8 builds keep serving cheap |
| **Zero-ops fallback** | Hosted Nous Hermes via **OpenRouter** | Same prompts/format; **non-sensitive tasks only**; a config switch |

Serving: **vLLM** with its built-in `--tool-call-parser hermes`. The Hermes **function-calling
format/dataset is Apache-2.0**; individual model licenses vary by base (Qwen3 = Apache-2.0; Llama-3.1 =
Llama Community License) — **verify the exact license on each model card before shipping.** Pick the
model on **BG/RU/Greek/Hebrew quality against the real migrated corpus** before committing (same
discipline as the search-engine choice in §9).

### 11.2 Tool-use / structured-output contract (how "agentic" is bounded)
Every call uses the standard ChatML Hermes format: tool schemas are supplied in the system prompt inside
`<tools>…</tools>`; the model emits `<tool_call>{"name":…,"arguments":…}</tool_call>`; the app executes
the tool and returns `<tool_response>{…}</tool_response>`. **Tools are read-only over approved CMS/search
data** (listing lookup, approved-content retrieval, comparable search) — the model has **no tool that
writes public state.** Structured drafts (translation, lead score, listing-quality, valuation range,
matching) come back as **schema-validated JSON**, checked by the deterministic pipeline before a human
sees them; an out-of-schema or ungrounded field is rejected, not displayed. Invented listings/prices are
structurally impossible because every fact must appear in a tool response.

### 11.3 Capability map
- **Public:** conversational property search; guided buyer questionnaire with explainable matches;
  similar-by-lifestyle; foreign-buyer assistant grounded in approved legal/process CMS content;
  multilingual listing Q&A; smart saved-search alerts.
- **Seller:** intake assistant; AI-assisted valuation *range* with broker review; listing-readiness
  score; photo-quality/missing-room detection; description draft from facts; pre-publish improvements.
- **Broker:** lead summary + next-best-action; lead scoring (budget/urgency/language/fit/repeat);
  auto-drafted WhatsApp/Viber/email follow-up; duplicate detection; per-contact matching; consented
  call-transcript summary; stale-listing detection; translation QA.
- **Content/SEO:** city/resort page drafts from CMS facts; internal-link suggestions; missing-metadata
  alerts; duplicate/thin-content warnings; hreflang/canonical checks; schema validation.

### 11.4 The Hermes Agent framework — adopted, but bounded
Nous also ships **`hermes-agent`** (`github.com/NousResearch/hermes-agent`, MIT): an autonomous agent
with persistent memory, reusable **skills** (agentskills.io standard), a multi-channel gateway
(Telegram/Discord/Slack/WhatsApp/Signal/CLI), and sandboxed local/Docker/SSH/browser execution. We adopt
its **tool-registry, persistent-memory, and skill patterns** for internal broker/editor productivity —
but **its autonomy is deliberately disabled in this deployment:** no unattended browser control, no code
execution against production, no auto-send to customers. Its messaging gateway may drive **internal**
broker notifications (Telegram); every customer-facing message stays behind the existing human-approval
and broker-contact-approval ledgers. We take the machinery, not the autonomy — an agent with browser +
code + WhatsApp is exactly what a family agency's production must not run unsupervised.

### 11.5 Guardrails (hard)
AI never publishes listings, translations, valuations, legal/tax answers, or listing changes without
human approval. Hermes translation drafts cannot publish or mark pages indexable. Legal/tax/process
answers must cite approved CMS content. Users must know when they are chatting with AI. **By default all
inference runs on the self-hosted Hermes model so sensitive owner/buyer data stays on the EU box;** the
hosted OpenRouter fallback is used only for explicitly non-sensitive tasks. Every Hermes call is logged
in the AuditLog (model, prompt version, tool calls, tokens, sensitive-vs-not).

---

## 12. Automations & integrations

**Deterministic workflows (app-owned, critical):** inquiry routing → CRM lead → broker assignment →
instant confirmation; missed-SLA reminder → manager escalation; saved-search → new-match alert report
with open broker tasks only when current matches increase; status
→ sold/rented → remove from active search but **keep the SEO page if it has traffic** (archived/sold
state + related listings); slug change → automatic 301; new listing → sitemap update + internal-link
suggestions; missing translation → translation coverage report with open reviewer/Hermes tasks; new public locale → locale rollout report + Hermes draft queue → human
review → indexable only after approval; stale listing → broker verification report with open BG/RU
broker tasks; new valuation request → seller pipeline + callback task; post-viewing → feedback request; closed deal → testimonial/referral
request.

**Integrations — required:** Google Search Console · Yandex Webmaster · GA4 or privacy-aware analytics
· CRM email inbox · WhatsApp/Viber/phone click tracking · SMTP/email delivery · map provider · image
CDN · backup/restore. **Useful:** calendar sync · SMS · e-signature/document collection ·
accounting/commission export · portal exports where commercially useful · SEO monitoring.

**n8n** is for private internal experiments only, behind strict access controls — never critical
workflow truth. **Excluded on purpose:** public AVM widget (no honest local data; a wrong number
destroys trust — use "request a valuation" instead); AI auto-publishing/auto-negotiation; forking a
legacy CMS; letting n8n own workflow truth; adding AI before deterministic CRM/CMS workflows exist.

---

## 13. Zero-loss SEO migration (the critical constraint)

**Prime directive:** no existing indexable URL may disappear without an explicit destination. Every old
URL resolves as either **`200` on the same URL with equivalent content**, or a **single-hop `301` to
the closest equivalent**. **Never bulk-redirect old listing URLs to the homepage or search page.**

### Non-negotiable rules
1. Preserve property IDs, titles, prices, areas, locations, categories, descriptions, galleries, and
   uploaded image URLs where possible.
2. Preserve taxonomies (category type, resort, location, sale/rent, content categories).
3. Preserve multilingual routing and hreflang/canonical relationships.
4. Preserve `.ru` as Russian content unless an explicit consolidation decision is made.
5. Preserve metadata (title, description, canonical, robots, OG, hreflang, structured data) and all
   media assets + image alt text that drive image SEO.
6. Launch only after a crawl comparison proves URL, metadata, and content parity.

### Inventory (authoritative URL universe)
Union of: both domains' full sitemap trees (`.com/sitemap.html` + `.ru/sitemap_index.xml` and every
sub-sitemap); **Google Search Console + Yandex Webmaster** exports; GA4/server-log landing pages;
backlink export; a full crawl. Getting GSC/Yandex access is a hard precondition. External export
templates live in `migration/external/seo/`; real exports stay local and are **required** to clear the
SEO launch gate. Store as versioned migration snapshots (`migration/artifacts/`).

### Classification & mapping (per URL)
Classify: active listing · sold/rented/archived listing · page · post · taxonomy · location · type ·
technical/noindex · broken/obsolete. Then decide, in order of preference:
**keep same URL** → **301 to exact equivalent** → **301 to closest parent archive** → **410 only if
intentionally removed and worthless** → **noindex only if already non-indexable or explicitly approved.**

- **Sold/archived listings stay live** with archived/sold state + related listings when they have
  traffic — 13 years of long-tail equity, not mass-redirected to taxonomy pages.
- **`.ru` URLs map to `.ru` Russian URLs** unless consolidation is explicitly chosen; `.ru`
  preservation has a dedicated review lane (`ru_preservation_editor`).
- Dead/obsolete pages → closest useful parent, **never** the homepage by default.

### Redirect implementation
`old_url,new_url,status,reason` map for both domains, reviewer-approved. Only **mapped, reviewed,
same-content** rows become deployable 301s (`production/data/deployable-redirects.json`); everything
else stays non-deployable until reviewed. Prefer literal exact-match rules; keep chains to a single
hop. Keep sitemap URLs stable where possible (`.com` `/sitemap.html`, `.ru` `/sitemap_index.xml` +
`/sitemap.xml` behavior); preserve robots allowances for `/wp-content/uploads/`.

### Launch validation (before cutover)
Crawl old `.com` + `.ru`; crawl new staging; diff URL counts by type; verify every old URL returns
`200` / `301` / approved `410`; **zero redirect chains > 1 hop**; **zero accidental `noindex`** on
indexable pages; no canonical pointing to the wrong language/domain; no important page losing title,
description, H1, body, or images; all forms and CTAs work; sitemaps submitted in GSC + Yandex.

### Post-launch monitoring (first 30 days minimum)
Daily: 404s, redirect misses, crawl errors, indexing drops, top-landing-page traffic, organic
inquiries — patch redirect misses immediately, re-submit sitemaps after major fixes. Weekly: GSC +
Yandex coverage, ranking/traffic changes, sitemap discovered/indexed counts.

### Migration risk register
| Risk | Prevention |
|---|---|
| Mass redirect to homepage | Banned by rule; draft map generates **0** homepage targets; every 301 needs a named equivalent |
| Dropping sold/ancient listings | Keep-live archive policy; deletion needs per-URL review sign-off |
| Shipping fewer languages than today | Every existing translation ported before launch; per-locale word-count diff |
| `.ru` treated as redundant | Dedicated `.ru` preservation lane; RU-geo clicks watched vs baseline |
| `noindex`/robots leak on launch | Staging gated by auth, not meta; launch checks grep rendered pages before cutover |
| hreflang cannibalizes BG rankings | hreflang only for real approved translations; no auto-translated shells |
| `/wp-content/uploads/` 404s | Preserve media paths or 301 old uploads; verify image sample at launch |
| DNS/email breakage at cutover | Full DNS/MX/SPF/DKIM inventory; email records untouched |

### Definition of done (migration)
Done only when: full old URL inventory captured; redirect/content map reviewed; new site passes crawl
parity; both domains have valid sitemaps; GSC/Yandex properties configured; and **no high-value URL,
listing, image, metadata, or language route is lost** — not when the redesign "looks good."

---

## 14. Language / locale contract

Registry-driven (`locales/registry.json`, validated by `locales/validate_locale_registry.py`):

- Only `public_enabled: true` **and** `indexable: true` locales generate public indexable pages,
  hreflang entries, and localized sitemap URLs. `fallback_locale` must point to an existing
  public/indexable locale. Locale-prefixed URLs are the standard (`/bg/imoti/ms-987`,
  `/en/properties/ms-987`, `/el/akinita/ms-987`, `/he/properties/ms-987`, `/he/sell`).
- **Production flow:** admin adds/enables a locale → Hermes drafts from BG source → reviewer edits +
  approves → approved translation becomes public/indexable → hreflang, sitemap, search index, and
  localized routes generate → source edits mark dependent translations **stale** and create review tasks.
- BG is the default source locale. Admin CMS/CRM UI is exactly BG/RU/EN. Public seed set is BG, EN, DE,
  NL, RU, EL, HE. Hebrew is RTL (layout QA required). French is a disabled fallback example.
- **Never** add an indexable localized page unless the translation is reviewed and approved.

---

## 15. Phone-first & accessibility (non-negotiable UX gates)

Designed as if many users are on phones, older, and prefer calling over long forms. Gates proven in
`qa/mobile_elderly_static_check.py` + `qa/mobile-elderly-accessibility.md`:

44–48px touch targets · ~17px body text · strong contrast · plain-language labels ("Price", "Call
broker") · large labeled photo controls (no icon-only) · **cards-first search, map optional, never
map-only** · no forced signup before inquiry · no modal traps · short forms, one question per row ·
visible phone number + tap-to-call · **callback path for users who won't type** · pagination + "back to
results" state (no infinite scroll for serious search) · printable/shareable listing PDF · send-to-
family · clear focus states + keyboard nav · zoom tested at 125/150/200% · VoiceOver focus-order before
polish · correct `lang`/`dir` per page incl. **Hebrew RTL QA.**

---

## 16. Implementation phases & current status

Phases gate by dependency (each ships when its predecessor is proven), not by a fixed calendar.

| Phase | Scope | Status |
|---|---|---|
| **P0 · Local evidence pack** | Crawl/export pack, search fixtures, design-system screens, 360 CMS field prototype, CRM intake fixtures, static mobile/elderly QA gate | **Complete locally** |
| **P1 · Migration model** | Crawl CSVs → structured migration DB; reviewer UI for URL classification; redirect-map editor; metadata-gap + media-reconciliation dashboards; GSC/Yandex/backlink/analytics joins | **Contracts built** (`production/data/migration.sqlite`, `GET /api/admin/migration/review`, `POST /api/admin/redirect-approvals`, `seo-evidence.json`) |
| **P2 · Production public site** | Server-rendered routes, listing/search/location/seller/contact/guide pages, hreflang/canonical/schema, sitemap gen | **Contracts + stdlib HTML adapter + Next App Router build gate built**; React public UI polish pending |
| **P3 · CMS & CRM** | Payload-style content/admin model, property editor, media manager, translation workflow, dynamic locale registry (BG/RU/EN admin), lead inbox, buyer/seller pipelines, viewing/calendar/task | **Contracts + admin HTML workbenches + broker verification report built** (editor, migration review, lead inbox); Payload app pending |
| **P4 · Search, media & tours** | Final Typesense/Meilisearch index + worker; saved searches/alerts; Photo Sphere Viewer production; video/floor-plan; media fallback/captions | Fixtures, saved-search alert evaluator, gated-tour contract, and Typesense/Meilisearch sync/query worker paths built; live engine provisioning pending |
| **P5 · Automation & AI** | Deterministic workers; broker reminders; stale checks; translation/SEO tasks; **Hermes** (self-hosted Nous open-weight) draft assistants with audit logs | Guardrails, ledgers, translation coverage, locale rollout, dispatch batch, and OpenAI-compatible draft worker path built; self-hosted Hermes/vLLM endpoint provisioning pending |
| **P6 · Launch readiness** | Production crawl diff; redirect-chain + sitemap/robots + schema validation; accessibility QA; performance budgets; analytics + monitoring; rollback plan | Launch-readiness report aggregates gates; redirect reviews are locally complete; **blocked on external SEO exports, reviewed listing-quality CSV, and live service reports** |

**What is proven in code right now** (see `production/README.md` and git history):
crawl pack for both domains (457 URLs), SQLite migration DB + review dashboards, Typesense/Meilisearch
import fixtures (165 source listings → 167 locale-scoped docs), 165-row redirect-approval workbook,
reviewer-gated deployable 301 export, authenticated admin migration/editor/lead workbenches,
approved-translation-gated localized sitemap (`sitemap.xml` + `robots.txt`), `RealEstateListing`
JSON-LD report over all indexable entries, listing-quality report, server-rendered public HTML with OG
+ hreflang + schema, approved CMS guide pages cited by Hermes, broker-approval-gated phone/WhatsApp/Viber, 360-tour approval overlay, append-only
lead/reply/viewing/deal/saved-search/seller/broker-contact/tour/analytics ledgers, SEO-evidence join,
missed-SLA report that creates broker reminders and manager escalations from unreplied leads,
listing-status workflow that keeps sold pages live while removing them from active inventory,
CMS slug-history workflow that creates path-only automatic 301s to canonical listing routes,
listing-publication workflow that proves sitemap paths and internal-link suggestions,
mobile/elderly QA report, and a live Node server (`npm start`) exposing the same contracts.

**Blocked until launch:** real external SEO exports (Search Console / Yandex / backlinks) under
`migration/external/seo/`, reviewed listing-quality fixes under `migration/reviews/listing-quality.csv`,
plus live Typesense/Meilisearch sync/query and Hermes draft-worker reports. Redirect reviews are locally
complete and covered by the reviewed deployable 301 export.

---

## 17. Cost (planning ranges, not a quote)

The stack is self-hostable and cheap to run; the build is being done incrementally with AI assistance,
so there is no fixed wall-clock delivery estimate — phases ship when proven.

**Steady-state run (planning range):** EU VPS + PostgreSQL + object storage/CDN + Typesense/Meilisearch
+ transactional email + MapLibre (no map billing) + AI (Hermes) + monitoring ≈ **low-to-mid hundreds of
€/month**, of which existing portal listing fees are the largest line and are already being paid. If any
phase is outsourced, budget senior full-stack + fractional SEO for the migration window accordingly.

---

## 18. Non-negotiables & explicit non-goals

**Non-negotiables:** crawl parity before visual polish · existing indexable URLs resolve as equivalent
`200` or reviewed one-hop `301` · no bulk homepage redirects · `.ru` first-class Russian unless a
separate business decision says otherwise · public localized URLs use locale prefixes and become
indexable only after human approval · **Sandanski is never described as a sea destination** · AI never
publishes content/legal/translations/valuations/listing changes without broker/editor approval · phone,
Viber/WhatsApp, and callback paths are first-class conversions · mobile search works without map
interaction or account signup.

**Non-goals:** do not fork a legacy real-estate CMS · do not treat static design prototypes as
production SEO output · do not build a generic enterprise CRM · do not let n8n own workflow truth · do
not add AI before deterministic CRM/CMS workflows exist · do not build a public AVM · do not visually
polish screens that have not passed crawl, mobile, and accessibility gates.

---

## 19. Final definition of done

MS Realty is done when: the old `.com` and `.ru` URL sets are preserved or precisely redirected; listings
are editable, translatable, searchable, and publishable from the CMS; buyers can search, inspect media,
contact a broker, save/share, and request viewings on mobile; sellers can request valuation and enter the
broker pipeline; brokers can work leads, tasks, viewings, and property drafts inside the CRM; media
supports photos, video, floor plans, and accessible 360 tours; accessibility QA passes before visual
polish; AI and automation improve broker/editor speed without bypassing human review; and the launch
crawl proves parity before production cutover.

---

## 20. Repository map & how to run

This document is the only narrative source of truth. Everything else in the repo is code or
code-local documentation:

| Path | What it is |
|---|---|
| `README.md` | Short entry point + the one-line stack/facts |
| `SOURCE_OF_TRUTH.md` | **This file** — strategy + product + stack + migration + status |
| `production/` | Interim executable contracts, Node server, build scripts, generated `data/` (`production/README.md`) |
| `migration/` | Crawler, migration DB builder, versioned crawl artifacts, external SEO templates (`migration/README.md`) |
| `search/` | Typesense/Meilisearch fixture builders + validators (`search/README.md`) |
| `locales/` | Locale registry + validator (`locales/README.md`) |
| `makler-realty-design-system/` | Design system + component prompt specs + UI-kit screens (`project/readme.md`) |
| `prototypes/` | 360-tour CMS field + CRM lead-intake prototypes |
| `qa/` | Mobile/elderly accessibility check + report |

```bash
npm run check     # tests + full validate pipeline (crawl → migration → search → sitemap → SEO → QA → launch readiness)
npm start         # run the interim production Node adapter (set MS_REALTY_ADMIN_TOKEN)
```
