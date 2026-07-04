# MS Realty Open-Source Research And SOTA Product Refinement

Date: 2026-07-04

This document refines the end-state MS Realty platform plan using current
open-source projects and public product patterns. It focuses on what to learn,
what to avoid, and what to change so the new platform is genuinely modern:
CRM, CMS, AI, seller flows, phone-first UX, elderly-user accessibility,
video/virtual tours, and SEO-safe migration.

## Executive Decision

Do not fork a legacy real-estate CMS as the foundation.

Build a domain-specific MS Realty platform using modern open-source building
blocks:

- Public site: server-rendered, SEO-first property marketplace.
- CMS/admin: Payload CMS-style code-first content/admin model, or Directus if
  the priority becomes no-code database administration.
- CRM: custom real-estate CRM inspired by Twenty, Frappe CRM, EspoCRM, and
  SuiteCRM patterns, not a generic CRM bolted onto the side.
- Search: Typesense or Meilisearch for instant faceted property search.
- Maps: MapLibre GL JS.
- Tours: Photo Sphere Viewer or Pannellum for 360 tours; Video.js/HLS for
  property videos.
- Automation: application-owned queues for critical workflows; n8n only for
  non-critical internal automations behind strict access controls.
- AI: model-agnostic assistant layer for matching, translation, lead scoring,
  listing quality, tours/media metadata, seller valuation support, and broker
  productivity.

The target product should be simpler than enterprise CRM software, but much
more complete than a property website.

## Open-Source Projects Reviewed

### Real Estate Domain Projects

| Project | Useful lessons | What to avoid |
|---|---|---|
| PropertyWebBuilder | Real-estate-specific primitives: listings, multilingual, multi-currency, faceted search, tenant/admin split. Good proof that property CMS+CRM concerns are domain-specific. | Do not inherit the whole Rails/Vue architecture unless the team wants that stack. Use it as a domain reference, not as the product base. |
| Open Real Estate CMS | Multilingual/currency expectations, agency website conventions, old-school admin flows. | Dated UX and architecture. Do not use as a SOTA UI baseline. |
| MicroRealEstate | Landlord/rental workflows: tenant, rent, property management, recurring tasks. | It is landlord/PMS-focused, not sales agency/lead-gen focused. |
| EspoCRM Real Estate extension | CRM object model for properties, contacts, opportunities, workflows. | EspoCRM UI is not the desired public/admin experience. |
| Random MERN/Laravel real-estate GitHub projects | Common CRUD shape: users, listings, images, maps, reviews. | Mostly portfolio apps. Do not treat them as architecture references. |

Useful sources: [PropertyWebBuilder](https://github.com/etewiah/property_web_builder),
[PropertyWebBuilder docs](https://etewiah.github.io/property_web_builder/),
[Open Real Estate CMS](https://open-real-estate.info/),
[MicroRealEstate](https://github.com/microrealestate/microrealestate),
[EspoCRM real estate extension](https://github.com/espocrm/ext-real-estate).

## CRM/CMS Research

### CRM

| Project | Keep |
|---|---|
| Twenty | Modern CRM UX: objects, views, workflows, tasks, notes, dashboards, AI-agent direction. Good inspiration for broker workspace and flexible CRM objects. |
| Frappe CRM / ERPNext | Strong open-source business app ecosystem and unlimited-user CRM idea. Good reference for extensible business objects. |
| EspoCRM | Practical self-hosted CRM with real estate extension, workflows, BPM/SMS ecosystem. Good reference for mature CRM operations. |
| SuiteCRM | Mature enterprise CRM concepts: dashboards, modules, workflows, permissions, customer 360. Good reference, not UX target. |

Sources: [Twenty](https://github.com/twentyhq/twenty),
[Frappe CRM](https://github.com/frappe/crm),
[Frappe/ERPNext](https://github.com/frappe),
[EspoCRM](https://github.com/espocrm/espocrm),
[SuiteCRM](https://github.com/SuiteCRM/SuiteCRM).

### CMS

| Project | Keep |
|---|---|
| Payload CMS | Best fit if the platform is TypeScript/Next.js: code-first content model, admin panel, auth, localization, access control, digital asset management. |
| Directus | Best fit if the existing database must be exposed quickly to editors with REST/GraphQL and no-code admin. Also has native MCP direction. |
| Strapi | Strong open-source headless CMS with media library, i18n, roles, workflows. Good alternative, but less ideal if the app wants one TypeScript full-stack codebase. |
| Wagtail | Best accessibility/editorial reference. Strong for government-grade content workflows and accessibility checks. |

Recommendation: use Payload-style architecture for MS Realty unless the team
chooses a Python/Django route. Borrow Wagtail's accessibility mindset and
editorial QA checks.

Sources: [Payload](https://payloadcms.com/),
[Directus](https://directus.com/),
[Strapi](https://strapi.io/),
[Wagtail accessibility](https://wagtail.org/government/).

## Search, Maps, Media, Tours

### Search

Use instant faceted search with typo tolerance. Real-estate users misspell
locations and switch between Bulgarian, Russian, English, German, and Dutch.

- Typesense: strong for search-as-you-type, faceted navigation, geo search.
- Meilisearch: strong for typo tolerance, faceting, hybrid semantic/full-text
  direction, very simple developer experience.

Recommendation: prototype both with the migrated listing dataset. Choose based
on Bulgarian/Russian transliteration quality, geo filters, and admin rebuild
speed. For end state, keep vector/semantic search separate enough that the
engine can be swapped.

Sources: [Typesense](https://typesense.org/),
[Meilisearch](https://github.com/meilisearch/meilisearch).

### Maps

Use MapLibre GL JS for open-source map rendering. Keep Google Maps optional for
places/geocoding if business value justifies it.

Required property-map behavior:

- List/map split on desktop.
- Map optional on mobile, never the only path.
- Approximate-location mode for privacy.
- Nearby amenities and drive-time only after core listing search is solid.

Source: [MapLibre GL JS](https://www.maplibre.org/maplibre-gl-js/docs/).

### Video And Virtual Tours

End-state listing media must support:

- Photo gallery.
- Short vertical video.
- Long walkthrough video.
- 360 panorama.
- Multi-room virtual tour with hotspots.
- Floor plan.
- Document/media moderation before publish.

Open-source choices:

- Photo Sphere Viewer: best default for modern 360 tours, plugins, hotspots,
  gyroscope/mobile support.
- Pannellum: lightweight fallback for simple panoramas.
- Marzipano: useful for static/exportable panorama tours and multi-scene tour
  concepts.
- Video.js + HLS.js/VHS: accessible adaptive video playback.

Sources: [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/),
[Pannellum](https://pannellum.org/),
[Marzipano](https://www.marzipano.net/),
[Video.js](https://videojs.org/),
[HLS.js](https://github.com/video-dev/hls.js/).

## AI-Powered Features

### Public-Facing AI

- Conversational property search: "I want a quiet apartment near the park in
  Sandanski under 120k EUR."
- Guided buyer questionnaire with explainable matches.
- Similar properties by lifestyle, not only category.
- Foreign-buyer assistant grounded in approved legal/process CMS content.
- Multilingual listing Q&A.
- Smart saved-search alerts: price drop, new similar listing, back-on-market.

### Seller AI

- Seller intake assistant: address, type, area, condition, photos, ownership
  status, target price, urgency.
- AI-assisted valuation range with broker review.
- Listing readiness score.
- Photo quality and missing-room detector.
- Description draft from facts and broker notes.
- Suggested improvements before publishing.

### Broker AI

- Lead summary and next best action.
- Lead score: budget fit, urgency, language, property fit, repeat intent.
- Auto-drafted WhatsApp/Viber/email follow-up.
- Duplicate lead/contact detection.
- AI property matching for each contact.
- Call transcript summary with consent.
- Stale listing detector.
- Translation QA.

### Content/SEO AI

- Draft city/resort pages from structured CMS facts.
- Internal linking suggestions.
- Missing metadata alerts.
- Duplicate/thin content warnings.
- Hreflang/canonical consistency checks.
- Schema validation assistant.

### Guardrails

- AI never publishes without human approval.
- AI legal/tax content must cite approved CMS pages.
- All AI actions are logged.
- Users must know when they are chatting with AI.
- Sensitive owner/buyer data stays out of external model calls unless explicitly
  approved and logged.

Reference examples: [AI real estate assistant](https://github.com/AleksNeStu/ai-real-estate-assistant),
[Zillow compliant real estate chatbot](https://github.com/zillow/compliant-real-estate-chatbot).

## Sell Your Property: End-State Flow

This must be a first-class product, not a contact form.

### Public Seller Journey

1. Seller lands on "Sell your property".
2. Chooses property type.
3. Enters location, area, rooms, floor/land, condition, target price.
4. Uploads photos or schedules a broker visit.
5. Gets "valuation request received" confirmation.
6. Books call/visit time.
7. Receives checklist: documents, ownership proof, keys/access, photos.
8. Broker CRM pipeline starts automatically.

### Seller Dashboard

- Property intake status.
- Broker assigned.
- Next appointment.
- Missing documents.
- Listing draft preview.
- Marketing status.
- Viewing requests.
- Offers.

### Broker Seller Workspace

- Valuation pipeline.
- Comparable listings.
- Media checklist.
- Mandate/commission notes.
- Publish readiness.
- Marketing package selection.

## Phone-First And Elderly-User UX

This platform should be designed as if many users are on phones, older, and
prefer calling instead of completing long forms.

### Non-Negotiable Mobile Rules

- Every primary action reachable with thumb.
- Sticky bottom actions on listing pages: Call, Viber/WhatsApp, Ask, Save.
- No tiny controls; touch targets at least 44-48 px.
- Minimum body text around 17 px, with strong contrast.
- Filters are simple drawers with large controls.
- Search results are cards first; map is optional.
- No forced account creation before inquiry.
- No modal traps.
- Forms are short, one question per row, with autofill.
- Phone number always visible and tap-to-call.
- Bulgarian-first language behavior, with EN/BG/DE/NL/RU clearly available.
- Low-bandwidth image mode and lazy media.
- "Call me back" flow for users who do not want typing.

### Elderly-Focused Improvements

- Plain-language labels: "Price", "Area", "Call broker", not clever labels.
- Large photo controls with visible arrows.
- Avoid icon-only actions unless labeled.
- Avoid map-only discovery.
- Avoid infinite scroll for serious search; provide pagination and "back to
  results" state preservation.
- Provide printable/shareable listing PDF.
- Provide "send this listing to family" action.
- Voice-call and callback as first-class conversion paths.
- Error messages next to fields, in plain language.
- Strong focus states and keyboard navigation.
- High contrast mode or at least no low-contrast gray text.

Sources: [GOV.UK Design System](https://design-system.service.gov.uk/),
[USWDS accessibility principles](https://designsystem.digital.gov/design-principles/),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[NN/g older adults usability](https://www.nngroup.com/articles/usability-for-senior-citizens/).

## UI/UX Redesign Direction

The current redesign should move away from decorative real-estate template
patterns and toward an operational property search product.

### Public UI

- First viewport: direct search plus Buy/Rent/Sell/Invest/Foreign Buyers.
- Listing cards: photo, price, area, location, status, updated date, property
  ID, broker action.
- Search page: list-first mobile, split map/list desktop.
- Listing detail: media, facts, contact, description, location, process,
  similar listings.
- Local pages: editorial guide plus live listings.
- Seller page: valuation/intake flow.
- Foreign buyer section: guide + consultation CTA.

### Admin UI

- Broker dashboard is task-driven, not analytics-first.
- Lead inbox resembles a modern CRM inbox.
- Property editor has quality checklist and translation tabs.
- Listing media manager supports photo/video/360/floor plan.
- AI suggestions appear as drafts, never auto-published.

## Automation Refinements

Use deterministic workflows for business-critical tasks:

- Inquiry routing.
- SLA reminders.
- Saved search alerts.
- Listing stale checks.
- Translation tasks.
- Sitemap rebuilds.
- Redirect generation from slug changes.
- Seller intake pipeline.
- Post-viewing follow-up.

n8n is useful for internal experiments and integrations, but not as the only
source of truth. If self-hosted, lock it down. 2026 reporting on n8n security
issues reinforces that workflow tools need strict patching and private access.

Sources: [n8n GitHub](https://github.com/n8n-io/n8n),
[n8n AI agents](https://n8n.io/ai-agents/).

## Migration Refinements

The SOTA platform only matters if it does not destroy existing search traffic.

### Mandatory Steps

1. Export every URL from `.com` `/sitemap.html` and every sub-sitemap.
2. Export every URL from `.ru` `/sitemap_index.xml` and every sub-sitemap.
3. Pull Search Console, Yandex Webmaster, backlink, and analytics landing-page
   data before launch.
4. Classify each URL: active listing, archived listing, page, post, taxonomy,
   location, technical, noindex, broken.
5. Preserve exact URLs where possible.
6. If URL changes, create one-hop 301 to the exact equivalent.
7. Preserve `.ru` as first-class Russian unless there is an explicit
   consolidation decision.
8. Preserve media paths or 301 old uploads to new media URLs.
9. Generate hreflang and canonical relationships from translation mappings.
10. Validate old-vs-new crawl parity before launch.

Sources: [Google site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes),
[Google hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions),
[Google structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data),
[Schema.org RealEstateListing](https://schema.org/RealEstateListing),
[Yandex sitemap docs](https://yandex.com/support/webmaster/en/indexing-options/sitemap),
[Yandex site move docs](https://yandex.com/support/webmaster/en/yandex-indexing/moving-site).

## Missing Features To Add To The End-State Plan

- First-class seller valuation/intake portal.
- First-class landlord flow.
- Listing verification/updated date.
- Availability status workflow.
- Mobile listing PDF/share flow.
- WhatsApp/Viber/call tracking.
- Phone-first saved search alerts.
- Virtual tours and video pipeline.
- Floor plans.
- Broker calendar and viewing management.
- Lead SLA dashboard.
- AI lead scoring and matching.
- AI translation and listing quality QA.
- AI content/SEO QA.
- Accessibility QA gates.
- Elderly-user mode/design rules.
- Media moderation and alt text workflow.
- Sitemap/redirect admin surface.
- URL inventory and crawl-diff tool.

## Updated Target Stack

Recommended default:

- Next.js public app, server-rendered/static where possible.
- Payload CMS/admin for listings, pages, media, translations, redirects, users.
- PostgreSQL for canonical data.
- Typesense or Meilisearch for property search.
- MapLibre GL JS for maps.
- Photo Sphere Viewer plus Video.js/HLS.js for tours and video.
- Queue workers for alerts, sitemap generation, imports, media processing, AI.
- CRM module inside the same admin app, inspired by Twenty/Frappe/EspoCRM.
- Optional n8n for private internal workflow experiments.
- AI layer with swappable model provider, retrieval over approved CMS content,
  and full audit logs.

Do not choose the stack before running a small migration/search spike with real
Makler data. The product should be selected by migration risk and editor/broker
workflow fit, not framework taste.

## Next Work

1. Build the crawler/exporter for `.com` and `.ru`.
2. Produce URL inventory, metadata inventory, media inventory, and redirect map.
3. Create real design-system screens for:
   - Mobile search.
   - Listing detail.
   - Sell your property.
   - Broker lead inbox.
   - Property editor.
4. Prototype search with real listings in Typesense and Meilisearch.
5. Prototype 360 tour CMS field with Photo Sphere Viewer.
6. Prototype CRM lead intake from one listing inquiry and one seller valuation.
7. Run mobile/elderly accessibility QA before visual polish.
