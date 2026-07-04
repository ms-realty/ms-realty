# MS Realty Final End State

Date: 2026-07-04

This document defines the polished target state for MS Realty after the
crawl-first migration, product rebuild, CRM/CMS implementation, and mobile QA
work are complete.

The platform must become a real property-search and broker-operations system,
not just a redesigned website.

## Current Baseline

The local repository already contains the first migration-safe execution slice.

Implemented now:

- Local git repository initialized at `/Users/ivan/Code/MS-Realty`.
- Crawl/export tool for both required sources:
  - `https://makler-realty.com/sitemap.html`
  - `https://makler-realty.ru/sitemap_index.xml`
- Versioned crawl artifact:
  - `migration/artifacts/20260704-211155/url-inventory.csv`
  - `migration/artifacts/20260704-211155/metadata-inventory.csv`
  - `migration/artifacts/20260704-211155/media-inventory.csv`
  - `migration/artifacts/20260704-211155/redirect-map-draft.csv`
  - `migration/artifacts/20260704-211155/crawl-summary.md`
- Current crawl counts:
  - 457 total URLs.
  - 278 `.com` URLs.
  - 179 `.ru` URLs.
  - 165 listing pages.
  - 146 taxonomy pages.
  - 104 informational pages.
  - 42 posts.
  - 11,859 media rows.
  - 0 fetch failures.
  - 0 homepage redirect-map targets.
- Search fixture builder for Typesense and Meilisearch:
  - `search/build_search_indexes.py`
  - `search/data/listings.json`
  - `search/data/index-listings.json`
  - `search/data/typesense-schema.json`
  - `search/data/typesense-listings.jsonl`
  - `search/data/meilisearch-settings.json`
  - `search/data/meilisearch-listings.ndjson`
  - current search import feed: 167 locale-scoped documents, including approved Greek and Hebrew search documents for `MS-CRAWL-0001`
  - `search/validate_search_imports.py` checks both search-engine import payloads without requiring Docker in the default gate
- Design-system prototype screens:
  - `makler-realty-design-system/project/ui_kits/remaining/index.html`
  - Mobile search.
  - Listing detail.
  - Sell your property.
  - Broker lead inbox.
  - Property editor.
- 360 tour CMS field contract:
  - `prototypes/360-tour-cms/README.md`
- Executable 360 tour CMS/public contract:
  - CMS seed has draft `photo-sphere-viewer` tour fields for every listing
  - public listing pages keep tours unavailable until panorama and caption review
  - fallback galleries remain available without WebGL
- Executable media moderation contract:
  - imported listing photos are normalized into public gallery candidates
  - floor-plan/video/tour assets are review-gated until explicitly approved
  - public listing pages expose moderated media, not raw crawl chrome
- CRM lead-intake examples:
  - `prototypes/crm-lead-intake/lead-intake-demo.json`
- Admin locale creation contract:
  - `POST /api/admin/locales`
  - new website locales stay non-public and non-indexable by default
  - admin CRM/CMS languages remain BG, RU, and EN
- Broker viewing/task contract:
  - `POST /api/admin/viewings`
  - booked viewings require known CRM leads and create open follow-up tasks
- Migration review queue:
  - every crawled URL has a review owner, admin locale, action, and priority
  - `.ru` preservation rows are kept in a dedicated review lane
  - non-listing pages, posts, and taxonomy URLs stay unmapped until editorial review
- Saved search/alert contract:
  - `POST /api/saved-searches`
  - saved searches persist search criteria, match count, and an open alert task
- Seller pipeline contract:
  - seller valuation leads create `valuation_requested` pipeline rows
  - callback and appraisal checklist tasks start open
- Dynamic locale publishing contract:
  - newly added public locales can draft, approve, publish, and serve a locale-prefixed listing from the translation ledger
  - served sitemap XML includes those approved dynamic locale routes
  - search API cards reflect the same reviewed dynamic locale translation state
- Runtime search filter contract:
  - query and core facets are applied before pagination
  - result payloads expose total matches separately from returned cards
  - saved-search alerts use the full filtered match count
- Mobile and elderly-user QA gate:
  - `qa/mobile_elderly_static_check.py`
  - `qa/mobile-elderly-accessibility.md`

Validation already passes:

```bash
python3 search/build_search_indexes.py
python3 search/validate_search_imports.py
python3 -m py_compile migration/crawl_inventory.py search/build_search_indexes.py search/validate_search_imports.py qa/mobile_elderly_static_check.py
python3 qa/mobile_elderly_static_check.py
```

## Product End State

MS Realty will be a multilingual, SEO-safe, phone-first real estate platform
for buyers, sellers, and brokers.

The final product will include:

- Public property marketplace.
- Server-rendered listing pages.
- Migration-preserving URL and redirect layer.
- Dynamic approved multilingual content model with BG as the source locale.
- Seeded public website locales: BG, EN, DE, NL, RU, EL, and HE.
- Admin CMS/CRM locales: BG, RU, and EN.
- Dedicated Russian-site preservation or an explicit reviewed consolidation.
- Faceted search powered by real listing data.
- Listing media pipeline for photos, video, floor plans, and 360 tours.
- Seller valuation and intake portal.
- Broker CRM lead inbox.
- Property editor and CMS workflow.
- Viewing/calendar/task workflow.
- Accessibility gates for mobile and older users.
- AI assistance only where human review and audit logs exist.

## Non-Negotiables

- Crawl parity comes before visual polish.
- Existing indexable URLs must resolve as equivalent `200` pages or reviewed
  one-hop `301` redirects.
- No bulk homepage redirects.
- `.ru` remains first-class Russian coverage unless a separate business
  decision says otherwise.
- Public localized URLs use locale prefixes and become indexable only after
  human approval.
- Sandanski must not be described as a sea destination.
- AI never publishes content, legal guidance, translations, valuations, or
  listing changes without broker/editor approval.
- Phone, Viber/WhatsApp, and callback paths are first-class conversions.
- Mobile search must work without requiring map interaction or account signup.

## Target Stack

Recommended implementation stack:

- Public app: Next.js with server-rendered/static listing and location pages.
- CMS/admin: Payload CMS-style TypeScript content model.
- Database: PostgreSQL.
- Search: Typesense or Meilisearch, chosen after real-data import/query testing.
- Maps: MapLibre GL JS.
- 360 tours: Photo Sphere Viewer for the first implementation.
- Video: Video.js/HLS where adaptive playback is needed.
- Queues/workers: imports, sitemap generation, media processing, saved alerts,
  stale-listing checks, CRM reminders, and AI jobs.
- Optional automation: n8n only for private internal experiments, not as source
  of truth.
- AI: model-agnostic assistant layer with retrieval over approved CMS content,
  audit logs, and human approval.
- Locale registry: admin-managed dynamic locales, Hermes translation drafts,
  human approval, and RTL support before Hebrew/other RTL launch.

## Public Website

The public site will implement:

- Homepage with direct property search and clear buyer/seller paths.
- Search results page with:
  - Mobile list-first layout.
  - Desktop list/map split.
  - Large filters.
  - Pagination or durable result state.
  - Price, area, location, status, updated date, property ID, and broker CTA.
- Listing detail pages with:
  - SEO-safe server-rendered content.
  - Gallery.
  - 360 tour.
  - Video.
  - Floor plan.
  - Facts/specs.
  - Description.
  - Location context.
  - Similar properties.
  - Sticky mobile actions: Call, Viber/WhatsApp, Ask, Save.
  - Printable/shareable listing PDF.
  - Send-to-family/share action.
- Location/taxonomy pages with:
  - Editorial guide content.
  - Live listing blocks.
  - Crawlable pagination.
  - Canonical and hreflang controls.
- Foreign-buyer guides grounded in approved CMS content.
- Contact and callback flows.
- Dynamic language selector:
  - Approved public locales are shown as indexable options.
  - Unavailable languages fall back to the best approved locale and can be
    requested through Hermes chat.
  - Hebrew/Israel and Greek are seeded public website locales.

## Migration And SEO

The migration system will implement:

- URL inventory import from crawl artifacts.
- URL classification:
  - Active listing.
  - Archived listing.
  - Page.
  - Post.
  - Taxonomy.
  - Location.
  - Technical/noindex.
  - Broken/retired.
- Redirect map workflow:
  - Preserve same URL where possible.
  - Use one-hop exact-equivalent `301` when a URL must change.
  - Never auto-map non-homepage pages to homepage/search.
- Metadata parity checks:
  - Title.
  - Meta description.
  - H1.
  - Canonical.
  - Robots meta.
  - Hreflang.
  - Open Graph.
  - Schema.
- Media preservation:
  - Preserve old media URLs where feasible.
  - Redirect old uploads to new media URLs when required.
  - Track alt text and media ownership/status.
- Launch crawl validation:
  - Old URL crawl.
  - New staging crawl.
  - Diff report.
  - Redirect chain check.
  - Noindex/canonical check.
  - Sitemap and robots validation.

## CMS And Property Editor

The CMS will implement:

- Listings.
- Pages.
- Location/taxonomy pages.
- Posts.
- Brokers/agents.
- Media assets.
- 360 tours.
- Videos.
- Floor plans.
- Redirects.
- Locale registry.
- Translations.
- SEO metadata.
- Structured data fields.
- Seller intake records.
- Viewing appointments.
- Lead/contact references.

The property editor will include:

- Core listing facts.
- Price, area, room count, condition, ownership/status.
- Location and approximate-location privacy controls.
- Availability workflow.
- Verification/updated-date workflow.
- Translation tabs from the locale registry.
- Admin CMS/CRM interface available in BG, RU, and EN.
- Translation states per locale: missing, Hermes drafted, human edited,
  approved, published, and stale.
- SEO panel with metadata and schema readiness.
- Media manager for photos, video, floor plans, and 360 tours.
- Listing quality checklist.
- Publish approval state.
- AI draft suggestions with accept/reject controls.

## Search

Search will be implemented with the real listing corpus first, then enriched
from the production CMS.

Required behavior:

- Instant text search.
- Facets for location, property type, price, bedrooms, area, status, and
  language.
- Typo tolerance.
- Bulgarian/Russian search quality testing.
- Transliteration handling where useful.
- Saved searches.
- New-match and price-change alerts.
- Similar listings.
- Search analytics for zero-result queries and popular filters.
- Locale-scoped queries, reviewed-translation/fallback markers, and RTL-safe
  result cards.

Typesense and Meilisearch remain valid candidates. The final choice should be
made only after live import/query testing with the migrated listing corpus.

## Seller Flow

The sell-your-property flow will be a first-class product surface.

Public seller journey:

1. Choose property type.
2. Enter location, area, rooms, condition, and target price.
3. Upload photos or request a broker visit.
4. Provide contact preference: phone, Viber/WhatsApp, email.
5. Receive valuation-request confirmation.
6. Book a call or visit.
7. Receive a document/readiness checklist.
8. Create a seller CRM pipeline item automatically.

Seller workspace:

- Intake status.
- Assigned broker.
- Next appointment.
- Missing documents.
- Draft listing preview.
- Marketing status.
- Viewing requests.
- Offers.

Broker seller workspace:

- Valuation pipeline.
- Comparable listings.
- Media checklist.
- Mandate/commission notes.
- Publish readiness.
- Follow-up tasks.

## Broker CRM

The broker CRM will implement:

- Lead inbox.
- Buyer leads.
- Seller valuation leads.
- Contacts.
- Lead source attribution.
- Listing inquiry context.
- Duplicate contact detection.
- Pipeline stages.
- Broker assignment.
- SLA/callback tasks.
- Viewing appointments.
- Notes and timeline.
- Matched listings.
- Seller draft-property creation.
- Quick replies for phone, Viber/WhatsApp, and email.
- Reports for lead volume, response time, source quality, and stale tasks.

The CRM should be real-estate-specific and compact. It should borrow patterns
from modern CRMs without becoming a generic enterprise CRM clone.

## Media, Video, And 360 Tours

The media pipeline will implement:

- Photo gallery.
- Alt-text workflow.
- Broker/editor moderation before publish.
- Floor plan uploads.
- Short vertical video.
- Long walkthrough video.
- 360 panorama support through Photo Sphere Viewer.
- Optional multi-room hotspot tours.
- WebGL fallback: normal gallery and accessible caption must still work.
- Low-bandwidth media behavior on mobile.

The 360 CMS field contract already exists locally and should become the first
production implementation.

## AI And Automation

AI will be added after deterministic workflows exist.

Allowed AI features:

- Buyer matching assistant.
- Multilingual listing Q&A.
- Seller intake assistant.
- Broker lead summaries.
- Next-best-action drafts.
- Translation drafts and QA.
- Dynamic locale translation drafts for any admin-added locale.
- Listing description drafts from structured facts.
- Listing readiness scoring.
- Missing metadata warnings.
- Internal-link suggestions.
- Duplicate/thin content warnings.

Automation will handle:

- Inquiry routing.
- SLA reminders.
- Saved search alerts.
- Listing stale checks.
- Translation tasks.
- Sitemap rebuilds.
- Redirect generation from approved slug changes.
- Seller intake pipeline.
- Post-viewing follow-up.

Guardrails:

- Human approval required before publication or customer-visible AI action.
- Hermes translation drafts cannot publish or mark pages indexable.
- Approved CMS content required for legal/tax/process answers.
- Audit log for every AI action.
- Sensitive data controls before external model calls.

## Mobile And Elderly Accessibility

The production UI will preserve the QA rules proven in the local prototype:

- 44-48px minimum touch targets.
- 17px-ish readable body text.
- Strong contrast.
- Plain-language labels.
- Large photo controls.
- Labeled actions, not icon-only controls.
- No map-only discovery.
- No forced signup before inquiry.
- No modal traps.
- Short forms with one question per row.
- Visible phone number and tap-to-call.
- Callback path for users who do not want to type.
- Clear focus states and keyboard navigation.
- Browser zoom testing at 125%, 150%, and 200%.
- VoiceOver focus-order testing before visual polish.
- `lang` and `dir` attributes per page, including RTL QA for Hebrew.

## Implementation Phases

### Phase 0: Local Evidence Pack

Status: complete locally.

Delivered:

- Crawl/export pack.
- Search fixtures.
- Design-system screen pack.
- 360 CMS field prototype.
- CRM intake fixtures.
- Static mobile/elderly QA gate.

### Phase 1: Migration Model

Build:

- Import crawl CSVs into a structured migration database.
- Add reviewer UI for URL classification.
- Add redirect-map editor.
- Add metadata gap dashboard.
- Add media inventory reconciliation.
- Add Search Console, Yandex Webmaster, backlink, and analytics joins.

Done when:

- Every crawled URL has an owner, type, action, and review status.
- No redirect is generated without a closest-match target.

### Phase 2: Production Public Site

Build:

- Server-rendered public routes.
- Listing pages.
- Search results.
- Location/taxonomy pages.
- Seller page.
- Contact/callback flows.
- Hreflang/canonical/schema output.
- Sitemap generation.

Done when:

- Staging crawl matches the migration inventory.
- Old indexable URLs resolve as equivalent `200` pages or reviewed `301`s.

### Phase 3: CMS And CRM

Build:

- Payload-style content/admin model.
- Property editor.
- Media manager.
- Translation workflow.
- Dynamic locale registry with BG/RU/EN admin UI.
- Lead inbox.
- Buyer/seller pipelines.
- Viewing/calendar/task workflow.

Done when:

- A broker can receive a listing inquiry, call the lead, book a viewing, and
  update the lead without leaving the system.
- An editor can create, translate, QA, and publish a listing with media.

### Phase 4: Search, Media, And Tours

Build:

- Final Typesense or Meilisearch index.
- Search indexing worker.
- Saved searches and alerts.
- Photo Sphere Viewer production integration.
- Video/floor-plan support.
- Media fallback and accessibility captions.

Done when:

- Real listings are searchable by location/type/language.
- Listing detail media works on mobile and has non-WebGL fallback.

### Phase 5: Automation And AI

Build:

- Deterministic workflow workers.
- Broker reminders.
- Listing stale checks.
- Translation/SEO tasks.
- AI draft assistants with audit logs.

Done when:

- AI helps brokers/editors draft and review work, but cannot publish or send
  customer-visible output without approval.

### Phase 6: Launch Readiness

Build:

- Production crawl diff.
- Redirect chain validation.
- Sitemap/robots validation.
- Structured data validation.
- Accessibility QA.
- Performance budgets.
- Analytics and monitoring.

Done when:

- Migration parity is proven against the old crawl.
- Required manual QA is complete.
- Launch rollback and monitoring plans exist.

## Explicit Non-Goals

- Do not fork a legacy real-estate CMS as the base.
- Do not treat static design prototypes as production SEO output.
- Do not build a generic enterprise CRM.
- Do not let n8n own critical workflow truth.
- Do not add AI before deterministic CRM/CMS workflows exist.
- Do not visually polish screens that have not passed crawl, mobile, and
  accessibility gates.

## Final Definition Of Done

MS Realty is done when:

- The old `.com` and `.ru` URL sets are preserved or precisely redirected.
- Listings are editable, translatable, searchable, and publishable from the CMS.
- Buyers can search, inspect media, contact a broker, save/share, and request
  viewings on mobile.
- Sellers can request valuation and enter the broker pipeline.
- Brokers can work leads, tasks, viewings, and property drafts inside the CRM.
- Media supports photos, video, floor plans, and accessible 360 tours.
- Accessibility QA passes before visual polish.
- AI and automation improve broker/editor speed without bypassing human review.
- The launch crawl proves parity before production cutover.
