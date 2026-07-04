# Makler Realty SEO Migration Requirements

This is the minimum preservation gate for any rebuild of `makler-realty.com`
and `makler-realty.ru`.

## Current Facts To Preserve

- `makler-realty.com` is the multilingual/main domain.
- `makler-realty.ru` is an active Russian site, not a parked domain.
- `.com` uses a legacy WordPress sitemap index at `/sitemap.html`.
- `.com` sitemap index currently exposes 74 sub-sitemaps, including taxonomy,
  page, post, and monthly listing sitemaps going back to 2013.
- `.ru` uses a Yoast sitemap index at `/sitemap_index.xml`.
- `.ru` `/sitemap.xml` redirects to `/sitemap_index.xml`.
- `.ru` sitemap index currently exposes 11 sub-sitemaps:
  post, page, listings, category, post_tag, category_type, resort, floors,
  location, property, and type.
- Both domains expose WordPress-style robots rules that block admin/cache/query
  URLs and allow `/wp-content/uploads/` for image indexing.
- The `.com` language structure includes `/en/`, `/de/`, `/nl/`, and root/BG
  behavior; `.ru` is Russian-first and `/ru` resolves to the `.ru` root.

## Non-Negotiable Rules

1. No existing indexable URL can disappear without an explicit destination.
2. Every old URL must resolve as either:
   - `200` on the same URL with equivalent content, or
   - `301` to the closest equivalent new URL.
3. Never bulk-redirect old listing URLs to the homepage or search page.
4. Preserve property IDs, titles, prices, areas, locations, categories,
   descriptions, galleries, and uploaded image URLs where possible.
5. Preserve taxonomies: category type, resort, location, property sale/rent,
   and content categories.
6. Preserve multilingual routing and hreflang/canonical relationships.
7. Preserve Russian `.ru` content as Russian content unless the business
   explicitly chooses a domain consolidation plan.
8. Preserve metadata: title, meta description, canonical, robots, Open Graph,
   language alternates, and structured data.
9. Preserve all media assets and image alt text that currently drive image SEO.
10. Launch only after a crawl comparison proves URL, metadata, and content parity.

## Pre-Migration Inventory

Before implementation, export:

- Full `.com` URL inventory from `https://makler-realty.com/sitemap.html` and
  every sub-sitemap linked from it.
- Full `.ru` URL inventory from `https://makler-realty.ru/sitemap_index.xml`
  and every sub-sitemap linked from it.
- Current HTTP status, final URL, canonical, title, meta description,
  `hreflang`, robots meta, `h1`, word count, image count, and internal links
  for every URL.
- All uploads under `/wp-content/uploads/` referenced by pages/listings.
- Existing robots files, sitemap files, redirects, Search Console verified
  properties, analytics IDs, and tracking events.

## Redirect Map Requirements

Create `old_url,new_url,status,reason` mapping for both domains.

Required mappings:

- Listing to listing.
- Page to page.
- Taxonomy archive to equivalent archive.
- Resort/location/category pages to equivalent landing pages.
- Russian `.ru` URLs to `.ru` Russian URLs, unless explicitly consolidated.
- Dead/obsolete pages to the closest useful parent, never the homepage by default.

Status codes:

- Use `301` for permanent moves.
- Use `410` only for intentionally removed content with no replacement.
- Avoid `302` during launch except for short-lived operational testing.

## Content Parity Requirements

For every migrated listing, preserve at minimum:

- URL slug or a 301 from the old slug.
- Property title.
- Property ID.
- Price and currency.
- Area.
- Sale/rent status.
- Category/type.
- Location/resort.
- Main description.
- Gallery images.
- Contact action.
- Last updated / availability signal if available.

For every migrated informational page, preserve:

- Core body content.
- Heading hierarchy.
- Language.
- Internal links.
- Meta title and description intent.
- Calls to action.

## Technical SEO Requirements

- Generate XML sitemaps for both domains after launch.
- Keep `.com` and `.ru` sitemap URLs stable if possible:
  - `.com`: keep `/sitemap.html` or 301 it to the new sitemap index.
  - `.ru`: keep `/sitemap_index.xml` and `/sitemap.xml` behavior.
- Preserve robots allowances for uploaded images.
- Add canonical tags to every indexable page.
- Add hreflang between translated equivalents.
- Add JSON-LD where useful:
  - `RealEstateListing` for listings.
  - `Organization` / `RealEstateAgent`.
  - `BreadcrumbList`.
  - `FAQPage` for guide/FAQ pages.
  - `Article` for blog/resource pages.
- Keep pages server-rendered or pre-rendered enough for reliable crawling.
- Do not hide listing content behind client-only JavaScript.

## Launch Validation

Before DNS or production cutover:

- Crawl old `.com` and `.ru`.
- Crawl staging/new production.
- Compare URL counts by type.
- Verify every old URL returns `200`, `301`, or approved `410`.
- Verify zero redirect chains longer than one hop.
- Verify zero accidental `noindex` on indexable pages.
- Verify no canonical points to the wrong language/domain.
- Verify no important page loses title, description, H1, body text, or images.
- Verify all forms and contact CTAs work.
- Verify sitemap submission in Google Search Console and Yandex Webmaster.

## Post-Launch Monitoring

For the first 30 days:

- Monitor 404s daily.
- Monitor Google Search Console and Yandex Webmaster crawl/index errors.
- Monitor top landing pages, impressions, clicks, and average position.
- Monitor inquiry conversion by source.
- Patch redirect misses immediately.
- Re-submit sitemaps after major redirect fixes.

## Definition Of Done

The migration is not done when the redesigned site looks good. It is done only
when:

- Full old URL inventory is captured.
- Redirect/content map is reviewed.
- New site passes crawl parity.
- Both domains have valid sitemaps.
- Search Console/Yandex properties are configured.
- No high-value URL, listing, image, metadata, or language route is lost.
