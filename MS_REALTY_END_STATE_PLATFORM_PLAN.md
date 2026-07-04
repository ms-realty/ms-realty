# MS Realty End-State Platform Plan

This is the target-state plan for rebuilding Makler / MS Realty into a full
real-estate operating platform without losing existing SEO equity from
`makler-realty.com` or `makler-realty.ru`.

## 1. Product North Star

Build a multilingual real-estate platform for Bulgaria and nearby Greece that
combines:

- Public property marketplace.
- Agency website and local authority content hub.
- CMS for listings, guides, SEO pages, media, translations, and agents.
- CRM for buyer, seller, renter, landlord, investor, and foreign-buyer leads.
- Broker workspace for daily operations.
- AI assistant layer for matching, translation, listing quality, lead scoring,
  follow-up, and market summaries.
- Migration-safe SEO architecture preserving every existing valuable URL.

The product should feel like a trusted local agency with portal-grade search,
not a generic portal clone.

## 2. Current Migration Facts

Verified current state:

- `makler-realty.com` is active and multilingual.
- `.com` sitemap index: `https://makler-realty.com/sitemap.html`.
- `.com` sitemap index exposes 74 sub-sitemaps, including listings, pages,
  posts, and taxonomies going back to 2013.
- `makler-realty.ru` is an active Russian site, not a parked redirect.
- `.ru` sitemap index: `https://makler-realty.ru/sitemap_index.xml`.
- `.ru` `/sitemap.xml` redirects to `/sitemap_index.xml`.
- `.ru` sitemap index exposes 11 sitemap sections: posts, pages, listings,
  categories, tags, category types, resorts, floors, locations, property, type.
- Both domains expose robots rules that block admin/cache/query URLs and allow
  uploaded images.

No production rebuild can launch until the old URL inventory is exported and
mapped.

## 3. End-State Public Website

### Core Surfaces

- Homepage with clear entry points: Buy, Rent, Sell, Invest, Foreign buyers.
- Property search with list/map view, filters, sorting, saved searches, alerts.
- Listing detail pages with photos, facts, location, broker, inquiry actions,
  related listings, legal/process context, and structured data.
- City/resort pages: Sandanski, Bansko, Blagoevgrad, Petrich, St Vlas, Sunny
  Beach, Nafplio, Thessaloniki/Halkidiki, and other current taxonomy locations.
- Property-type pages: apartments, houses, villas, land, commercial, hotels,
  offices, industrial.
- Buyer guide, seller guide, rental guide, landlord guide, investment guide.
- Foreign-buyer section with multilingual process, taxes/fees, documents,
  remote purchase support, and FAQ.
- Agent/broker profiles.
- About, partners, services, contacts, privacy, cookies, legal pages.
- Resource center for market reports, local guides, news, and evergreen SEO.

### Listing Page Requirements

Each listing needs:

- Stable URL or redirect from old URL.
- Property ID.
- Current status: available, reserved, sold, rented, archived.
- Sale/rent type.
- Price and currency.
- Area, rooms, floor, land size, category, resort/location.
- Full translated descriptions.
- Gallery, captions, alt text, and image metadata.
- Map area or exact location policy.
- Updated date and verification badge.
- Broker/contact owner.
- Phone, WhatsApp/Viber, email, viewing request, similar listings.
- JSON-LD `RealEstateListing`, breadcrumbs, canonical, hreflang.

## 4. CMS

### Content Types

- Listing.
- Listing media.
- Location/city/resort.
- Property category/type.
- Agent/broker.
- Guide/article.
- Landing page.
- FAQ.
- Market report.
- Testimonial/case study.
- Translation object.
- Redirect rule.

### CMS Capabilities

- Draft/review/publish workflow.
- Scheduled publishing and unpublishing.
- Listing status workflow.
- Translation workflow per language.
- SEO fields per language: title, description, canonical, OG, robots.
- Slug history with automatic 301 creation.
- Media library with image compression, alt text, and preserved source paths.
- Bulk import/export for migration.
- Role-based permissions for admins, brokers, content editors, translators.
- Audit log for content and listing changes.

## 5. CRM

### Lead Types

- Buyer.
- Seller.
- Renter.
- Landlord.
- Investor.
- Foreign buyer.
- General inquiry.
- Partner/referral.

### CRM Objects

- Contact.
- Account/family/company.
- Lead.
- Deal/opportunity.
- Property interest.
- Viewing.
- Task.
- Communication thread.
- Document checklist.
- Saved search.
- Consent record.

### CRM Workflow

- Every inquiry creates a lead with source, language, property ID, budget,
  location interest, timeline, and preferred channel.
- Broker assignment by language, location, property type, or manual override.
- SLA timer starts immediately.
- Automatic follow-up if no broker action happens within configured window.
- Pipeline stages: new, qualified, viewing booked, viewed, offer, due
  diligence, contract, closed, lost.
- Seller pipeline: valuation requested, contacted, appraisal, mandate signed,
  listing prepared, published, offer, closed.
- Renter pipeline: inquiry, qualified, viewing, application, lease, closed.

## 6. Broker Workspace

- Today dashboard: new leads, overdue tasks, viewings, hot buyers, stale
  listings.
- Lead inbox with language, source, property, budget, and AI summary.
- Property matching view: buyer requirements against available listings.
- Viewing calendar and reminders.
- Listing quality checklist.
- Translation status and missing-content warnings.
- Bulk status updates for sold/rented/reserved listings.
- Communication templates for email, WhatsApp/Viber, SMS.
- Activity history per contact and property.
- Commission/process notes visible to authorized roles only.

## 7. AI Layer

### Practical AI

- Lead qualification assistant.
- AI summary of each inquiry and contact history.
- Property matching against buyer criteria.
- Similar-listing recommendations.
- Listing description draft from structured facts.
- Translation draft across Bulgarian, English, German, Dutch, Russian.
- Listing quality checker: missing price, weak title, no location, poor photos,
  duplicate text, missing alt text.
- Follow-up draft generation.
- Market guide drafts from approved data.
- FAQ assistant grounded in CMS content.

### Advanced AI

- Buyer preference learning from saved/search/click behavior.
- Investor analysis: yield estimate, expenses, comparable listings.
- Seller valuation assistant using internal listings, external comparables, and
  broker review.
- Broker task prioritization.
- Churn/stale-lead prediction.

### AI Guardrails

- AI never publishes listings without human approval.
- AI-generated translations are marked pending review.
- Legal, tax, and financing answers must cite approved content and route to
  human consultation.
- All AI actions are logged.

## 8. Automations

- New inquiry -> CRM lead -> broker assignment -> instant confirmation.
- Missed lead SLA -> broker reminder -> manager escalation.
- Saved search -> new matching listing alert.
- Listing status changed to sold/rented -> remove from active search but keep
  SEO page if it has traffic; show archived/sold state and related listings.
- Slug changed -> automatic 301.
- New listing published -> sitemap update -> internal linking suggestions.
- Missing translation -> task for translator/editor.
- Stale listing -> broker verification task.
- New seller valuation request -> seller pipeline and callback task.
- Post-viewing -> automated feedback request.
- Closed deal -> testimonial/referral request.

## 9. Integrations

### Required

- Google Search Console.
- Yandex Webmaster.
- GA4 or privacy-aware analytics.
- CRM email inbox integration.
- WhatsApp/Viber/phone click tracking.
- SMTP/email delivery.
- Map provider.
- Image CDN.
- Backup and restore.

### Useful

- Calendar sync.
- SMS provider.
- e-signature/document collection.
- Accounting/commission export.
- Property portal exports where commercially useful.
- Ahrefs/Semrush-style SEO monitoring.

## 10. Data Model

Minimum stable entities:

- `Property`
- `Listing`
- `ListingTranslation`
- `MediaAsset`
- `Location`
- `TaxonomyTerm`
- `Agent`
- `Contact`
- `Lead`
- `Deal`
- `Viewing`
- `SavedSearch`
- `Inquiry`
- `Communication`
- `Task`
- `Redirect`
- `SeoMetadata`
- `SitemapUrl`
- `MigrationSnapshot`
- `AuditLog`

Keep property identity separate from listing publication. A property can have
multiple listings/status changes over time, but old public URLs still need
stable handling.

## 11. Architecture

Recommended architecture:

- Public website: server-rendered or statically generated, multilingual,
  SEO-first.
- Admin app: authenticated broker/CMS/CRM workspace.
- API: typed backend for listings, leads, CRM, CMS, search, and AI.
- Database: relational store for canonical business data.
- Search index: property search and faceted filters.
- Object storage/CDN: images and documents.
- Queue/background workers: sitemap generation, alerts, imports, AI jobs,
  email, image processing.
- AI service layer: model calls, retrieval, prompt/version logs, moderation.
- Analytics/event pipeline: page views, search, inquiries, CTA clicks.

Do not make listing discovery client-only. Indexable listing and landing pages
must render meaningful HTML without JavaScript.

## 12. SEO Migration Plan

### Phase A: Inventory

Export from both domains:

- All sitemap URLs.
- All sitemap submaps.
- Crawl status and final URL.
- Canonical.
- Title and meta description.
- H1.
- Word count.
- Language.
- Hreflang.
- Robots meta.
- Internal links.
- Image URLs and alt text.
- Open Graph metadata.
- Schema.
- Inbound backlinks and top organic landing pages from Ahrefs/Search Console.

Store as versioned migration snapshots.

### Phase B: Classification

Classify every URL:

- Active listing.
- Sold/rented/archived listing.
- Page.
- Post/article.
- Taxonomy archive.
- Location/resort page.
- Property type page.
- Feed/technical URL.
- Blocked/noindex URL.
- Broken/obsolete URL.

### Phase C: Mapping

For every old URL, define:

- Keep as same URL.
- 301 to exact equivalent.
- 301 to closest parent archive.
- 410 only if intentionally removed and worthless.
- Noindex only if it was already non-indexable or explicitly approved.

Never redirect old listing URLs to the homepage by default.

### Phase D: Content Migration

Migrate:

- Listings and property IDs.
- Listing images and alt text.
- Descriptions and translations.
- Taxonomies and archive relationships.
- Pages/posts/guides.
- Metadata.
- Hreflang relationships.
- Internal links.
- Existing uploads.

### Phase E: Staging Crawl

Crawl old production and new staging:

- URL count parity.
- Status code parity.
- Metadata parity.
- H1/body/image parity.
- Canonical/hreflang validation.
- Redirect map validation.
- No redirect chains.
- No accidental noindex.
- No broken internal links.
- Sitemap validity.

### Phase F: Launch

- Freeze content briefly.
- Export delta since last crawl.
- Apply redirect map.
- Launch new platform.
- Submit `.com` and `.ru` sitemaps.
- Verify Search Console and Yandex Webmaster.
- Monitor logs and 404s.

### Phase G: 30-Day Monitoring

Daily:

- 404s.
- Redirect misses.
- Crawl errors.
- Indexing drops.
- Top landing page traffic.
- Organic inquiries.

Weekly:

- Search Console coverage.
- Yandex Webmaster coverage.
- Ranking/traffic changes.
- Sitemap discovered/indexed counts.
- Fix redirect/content gaps.

## 13. Delivery Workstreams

1. Discovery and inventory.
2. Information architecture and SEO mapping.
3. Data model and migration tooling.
4. Public website.
5. CMS.
6. CRM.
7. Broker workspace.
8. AI and automations.
9. Analytics and SEO monitoring.
10. QA, launch, and post-launch stabilization.

These run in parallel only after the URL/content inventory is locked.

## 14. Completion Criteria

The end-state platform is complete when:

- Every old `.com` and `.ru` URL has a reviewed outcome.
- No high-value indexed page is lost.
- Public pages render SEO-safe HTML.
- CMS can manage all migrated content.
- CRM captures and routes every lead.
- Broker workspace covers daily operations.
- AI features are useful, reviewed, and logged.
- Sitemaps, robots, canonical, hreflang, schema, and redirects validate.
- Search Console/Yandex Webmaster show no unresolved launch-critical errors.
- Organic traffic and inquiries are monitored through the transition.
