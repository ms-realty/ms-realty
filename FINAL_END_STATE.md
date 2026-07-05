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
- Structured migration database:
  - `migration/build_migration_db.py`
  - `production/data/migration.sqlite`
  - `production/data/migration-db-summary.json`
  - `production/data/migration-review-dashboard.json`
  - imports URL, metadata, media, and redirect CSV rows into indexed SQLite tables
  - exposes `migration_url_review` and `media_by_page` review views
  - reports metadata gaps, media reconciliation, and redirect safety for reviewers
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
  - `POST /api/admin/tours/approve` stores reviewed panorama/caption rows in `production/data/tour-approvals.jsonl`
  - approved tours overlay public listing routes with `psv-listing-tour` Photo Sphere Viewer mount data
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
  - booked viewings export through an admin-gated `.ics` calendar feed
- Broker lead inbox workbench:
  - `GET /admin/leads` renders the persisted CRM lead queue in BG/RU/EN admin locales
  - inbox rows preserve original lead language, admin queue locale, contact preference, source, and listing reference
  - reviewed replies can be queued from form submissions but are not auto-sent
- Property editor workbench:
  - `GET /admin/listings/edit` renders imported listing facts, translation state, SEO readiness, media count, and 360-tour review status
  - source edits can be submitted as form data and still mark dependent translations stale
  - the editor stays admin-only and uses the BG/RU/EN admin locale shell
- Migration review queue:
  - every crawled URL has a review owner, admin locale, action, and priority
  - `.ru` preservation rows are kept in a dedicated review lane
  - non-listing pages, posts, and taxonomy URLs stay unmapped until editorial review
- Migration review workbench:
  - `GET /admin/migration/review` renders metadata/media gaps, mapped listing rows, existing approvals, and deployable preview counts
  - only mapped listing rows are shown as approvable 301 candidates
  - form submissions post to the reviewed redirect approval endpoint and still require authenticated admin access
- Saved search/alert contract:
  - `POST /api/saved-searches`
  - saved searches persist search criteria, match count, and an open alert task
- Privacy-safe analytics contract:
  - `production/data/events.jsonl`
  - page views, searches, lead submissions, and CTA clicks are persisted without contact/message payloads
- SEO evidence join contract:
  - crawled URLs join to Search Console, Yandex Webmaster, backlink, optional analytics exports, and privacy event evidence
  - missing external exports are recorded as launch risks in `production/data/seo-evidence.json`
- Structured-data launch report:
  - all 167 indexable listing sitemap entries are checked for RealEstateListing JSON-LD readiness
  - missing source prices are recorded as warnings, not invented schema offers
- Launch readiness report:
  - `production/data/launch-readiness.json` aggregates current launch gates and rollback/monitoring steps
  - launch remains blocked until redirect reviews, external SEO exports, and final production app adapter are complete
- Seller pipeline contract:
  - seller valuation leads create `valuation_requested` pipeline rows
  - callback and appraisal checklist tasks start open
- Dynamic locale publishing contract:
  - newly added public locales can draft, approve, publish, and serve a locale-prefixed listing from the translation ledger
  - served sitemap XML includes those approved dynamic locale routes
  - search API cards reflect the same reviewed dynamic locale translation state
- Homepage contract:
  - approved locale roots serve real homepages with search, seller, contact, location, and featured listing paths
  - disabled locale roots remain non-indexable fallback/request flows
  - homepage routes participate in sitemap and hreflang output
- Contact callback contract:
  - approved public locales expose locale-prefixed contact pages, including Hebrew `/he/contact`
  - contact pages participate in sitemap and hreflang output
  - `website_contact_callback` submissions are stored as `general` CRM leads and remain broker-approval gated
- Location page contract:
  - real listing locations generate crawlable locale-prefixed pages only when that locale has indexable inventory there
  - Hebrew Sandanski is served at `/he/locations/sandanski`
  - empty locale-location pairs stay noindex/404 instead of becoming thin localized pages
- Runtime search filter contract:
  - query and core facets are applied before pagination
  - result payloads expose total matches separately from returned cards
  - saved-search alerts use the full filtered match count
- Listing conversion/share contract:
  - listing pages expose sticky mobile inquiry, callback, and viewing request actions through the lead intake endpoint
  - save, family-share, and browser-print/PDF-ready intents are part of the public payload
  - `?print=1` returns a locale-aware listing document ready for browser print-to-PDF
  - phone, WhatsApp, and Viber actions remain review-gated until broker contact data is approved
- Broker contact approval contract:
  - admin-reviewed broker phone data enables direct call, WhatsApp, and Viber listing actions
  - unapproved contact channels remain disabled in public payloads
  - approved contact rows are stored in an append-only broker contact ledger
- Lead contact preference contract:
  - public leads preserve phone, Viber, WhatsApp, or email preference
  - public viewing requests are stored as `website_viewing_request` buyer leads before broker booking
  - public contact callback requests are stored as `website_contact_callback` general leads
  - CRM inbox and append-only lead ledger expose the normalized preference for broker follow-up
  - unsupported contact channels are rejected before persistence
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

The first production implementation is the gated approval overlay: imported
listings start with draft tour fields, and only reviewer-approved panorama rows
become public Photo Sphere Viewer mounts.

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

- Import crawl CSVs into a structured migration database. Current local proof:
  `production/data/migration.sqlite`.
- Add reviewer UI for URL classification. Current local proof:
  `GET /api/admin/migration/review`.
- Add redirect-map editor. Current local proof:
  `POST /api/admin/redirect-approvals`.
- Add metadata gap dashboard. Current local proof:
  `production/data/migration-review-dashboard.json`.
- Add media inventory reconciliation. Current local proof:
  `production/data/migration-review-dashboard.json`.
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

Current local proof:

- The stdlib HTTP server can return SEO-safe listing and search HTML from the
  same runtime contracts used by the JSON smokes.
- A locale-prefixed seller valuation page can render as HTML/JSON and submit
  into the existing seller lead pipeline.
- The final Next.js route layer still needs to consume this contract before
  launch.

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
