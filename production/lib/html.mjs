import { renderReactAdminBody } from "./react-admin-site.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { chromeCopyFor } from "./public-site.mjs";
import { ADMIN_CLIENT_HASH, DS_HASH, FONTS_URL, PUBLIC_CLIENT_HASH } from "./ui/design-assets.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
}

function designSystemStyle() {
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${FONTS_URL}">`,
    `<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${DS_HASH}">`,
  ].join("\n");
}

function openGraph(page) {
  const title = page.metadata?.og_title || page.metadata?.title || "MS Realty";
  const description = page.metadata?.og_description || page.metadata?.description || "";
  const url = page.canonical || page.path || "/";
  const image = page.body?.media?.gallery?.find((item) => item.url)?.url || null;
  return [
    ["og:type", page.kind === "listing" ? "article" : "website"],
    ["og:site_name", "MS Realty"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ["og:locale", page.lang || page.locale || "en"],
    image ? ["og:image", image] : null,
  ]
    .filter(Boolean)
    .map(([property, content]) => `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}">`);
}

function meta(page) {
  const links = [
    `<link rel="canonical" href="${escapeHtml(page.canonical || page.path || "/")}">`,
    ...(page.hreflang || []).map(
      (link) => `<link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}">`,
    ),
  ];
  const schema = page.schema
    ? `<script type="application/ld+json">${JSON.stringify(page.schema).replace(/</g, "\\u003c")}</script>`
    : "";
  return [
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    designSystemStyle(),
    `<title>${escapeHtml(page.metadata?.title || "MS Realty")}</title>`,
    `<meta name="description" content="${escapeHtml(page.metadata?.description || "")}">`,
    `<meta name="robots" content="${escapeHtml(page.metadata?.robots || (page.indexable ? "index,follow" : "noindex,follow"))}">`,
    ...openGraph(page),
    ...links,
    schema,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderFacts(facts = {}) {
  return Object.entries(facts)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `<dt>${escapeHtml(key.replaceAll("_", " "))}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function formatPrice(card) {
  if (card.price_on_request) return "Price on request";
  if (card.price_eur === null || card.price_eur === undefined || card.price_eur === "") return "Price pending review";
  const price = Number(card.price_eur);
  if (!Number.isFinite(price)) return "Price pending review";
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price);
}

function cardSummary(card) {
  return [card.location, card.property_type, card.bedrooms ? `${card.bedrooms} bedrooms` : null, card.listing_status]
    .filter(Boolean)
    .join(" · ");
}

function renderListingCard(card, { actionLabel = "Listing card actions" } = {}) {
  const thumbnail = card.thumbnail?.url
    ? `<a href="${escapeHtml(card.path)}" data-card-thumbnail="true"><img src="${escapeHtml(card.thumbnail.url)}" alt="${escapeHtml(
        card.thumbnail.alt || card.title,
      )}" loading="lazy"></a>`
    : "";
  return `<article data-search-card="true" data-listing-id="${escapeHtml(card.id)}" data-translation-display="${escapeHtml(
    card.translation_display,
  )}" data-review-badge="${escapeHtml(card.review_badge)}" data-listing-status="${escapeHtml(card.listing_status)}">
    ${thumbnail}
    <p data-card-badge="true">${escapeHtml((card.review_badge || "").replaceAll("_", " "))}</p>
    <h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2>
    <p data-card-price="true">${escapeHtml(formatPrice(card))}</p>
    <p data-search-card-meta="true">${escapeHtml(cardSummary(card))}</p>
    <p data-card-media-count="${escapeHtml(card.image_count)}">${escapeHtml(card.image_count || 0)} photos</p>
    <nav aria-label="${escapeHtml(actionLabel)}">
      <a href="${escapeHtml(card.actions.detail.href)}">${escapeHtml(card.actions.detail.label)}</a>
      <button type="button" data-endpoint="${escapeHtml(card.actions.inquiry.endpoint)}" data-listing-reference="${escapeHtml(
        card.actions.inquiry.payload.listingReference,
      )}">${escapeHtml(card.actions.inquiry.label)}</button>
      <button type="button" data-client-save-listing="${escapeHtml(card.actions.save.listing_id)}" data-save-label="${escapeHtml(card.actions.save.label)}" data-saved-label="${escapeHtml(card.actions.save.saved_label || "Saved")}">${escapeHtml(card.actions.save.label)}</button>
    </nav>
  </article>`;
}

function listingPriceLabel(facts = {}) {
  if (facts.price_on_request === true) return "Price on request";
  if (facts.price_eur === null || facts.price_eur === undefined || facts.price_eur === "") return "Price pending review";
  const price = Number(facts.price_eur);
  if (!Number.isFinite(price)) return "Price pending review";
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price);
}

function listingHighlights(facts = {}) {
  return [facts.location, facts.property_type, facts.offer_type, facts.bedrooms ? `${facts.bedrooms} bedrooms` : null]
    .filter(Boolean)
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("");
}

function renderListing(page) {
  const gallery = (page.body.media.gallery || [])
    .slice(0, 12)
    .map(
      (image) =>
        `<img src="${escapeHtml(image.url)}"${image.fallback_url ? ` data-fallback-src="${escapeHtml(image.fallback_url)}"` : ""} alt="${escapeHtml(
          image.alt || page.body.h1,
        )}" loading="lazy">`,
    )
    .join("");
  const direct = page.body.actions.direct_contact.channels
    .map((channel) =>
      channel.enabled
        ? `<a href="${escapeHtml(channel.href)}">${escapeHtml(channel.label)}</a>`
        : `<span aria-disabled="true">${escapeHtml(channel.label)}</span>`,
    )
    .join("");
  const primary = page.body.actions.primary
    .map((action) => `<button type="button" data-endpoint="${escapeHtml(action.endpoint)}">${escapeHtml(action.label)}</button>`)
    .join("");
  const secondary = page.body.actions.secondary
    .map((action) => {
      if (action.kind === "share" || action.kind === "print" || action.kind === "link") {
        return `<a href="${escapeHtml(action.url)}" data-listing-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</a>`;
      }
      return `<button type="button" data-listing-action="${escapeHtml(action.id)}" data-client-save-listing="${escapeHtml(
        action.listing_id,
      )}" data-save-label="${escapeHtml(action.label)}" data-saved-label="${escapeHtml(action.saved_label || "Saved")}">${escapeHtml(action.label)}</button>`;
    })
    .join("");
  const related = (page.body.related_listings || [])
    .map((card) => `<article data-related-listing="true"><h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2></article>`)
    .join("");
  const tour = page.body.media.tour || {};
  const floorPlans = (page.body.media.floor_plans || [])
    .map((plan) => `<img src="${escapeHtml(plan.url)}" alt="${escapeHtml(plan.alt)}" loading="lazy">`)
    .join("");
  const videos = (page.body.media.videos || [])
    .map((video) => {
      const url = escapeHtml(video.url);
      const alt = escapeHtml(video.alt);
      return /\.(?:m3u8|mov|mp4|webm)(?:[?#]|$)/i.test(video.url)
        ? `<figure><video controls preload="metadata" src="${url}" aria-label="${alt}"></video><figcaption>${alt}</figcaption></figure>`
        : `<figure><a href="${url}" target="_blank" rel="noreferrer">Video</a><figcaption>${alt}</figcaption></figure>`;
    })
    .join("");
  const verification = page.body.verification?.verified
    ? `<p data-availability-verification="true">availability verified <time datetime="${escapeHtml(
        page.body.verification.availability_verified_at,
      )}">${escapeHtml(page.body.verification.availability_verified_at)}</time></p>`
    : "";
  return `
<main data-kind="listing" data-review-status="${escapeHtml(page.body.actions.direct_contact.review_status)}" data-listing-status="${escapeHtml(
    page.body.lifecycle?.status || "available",
  )}" data-active-in-search="${escapeHtml(page.body.lifecycle?.active_in_search ? "true" : "false")}" data-min-touch-target="44">
  <nav aria-label="Save and share" data-listing-tools="true">${secondary}</nav>
  <section aria-label="Listing summary" data-listing-summary="true" data-source-domain="${escapeHtml(
    page.body.source.source_domain,
  )}" data-schema-ready="${escapeHtml(page.schema ? "true" : "false")}">
    <p data-listing-verification="true">${escapeHtml(page.translation.human_approved ? "reviewed translation" : "approved source")}</p>
    ${verification}
    <h1>${escapeHtml(page.body.h1)}</h1>
    <p data-listing-price="true">${escapeHtml(listingPriceLabel(page.body.facts))}</p>
    <ul data-listing-highlights="true">${listingHighlights(page.body.facts)}</ul>
  </section>
  <section aria-label="Listing content" data-listing-content-grid="true">
    <section aria-label="Listing media and facts" data-listing-main-column="true">
      <p data-listing-description="true">${escapeHtml(page.body.description || "")}</p>
      <dl data-listing-facts="true">${renderFacts(page.body.facts)}</dl>
      <nav aria-label="Listing media" data-media-gallery-count="${escapeHtml(
        page.body.media.gallery_count || 0,
      )}" data-tour-status="${escapeHtml(tour.available ? "available" : tour.review_status || "review_required")}">
        <a href="#listing-gallery">Photos</a>
        ${floorPlans ? '<a href="#listing-floor-plans">Floor plans</a>' : ""}
        ${videos ? '<a href="#listing-videos">Videos</a>' : ""}
        <a href="#listing-tour" aria-disabled="${escapeHtml(tour.available ? "false" : "true")}">360</a>
      </nav>
      <section id="listing-gallery" aria-label="Gallery" data-photo-carousel="true">${gallery}</section>
      ${floorPlans ? `<section id="listing-floor-plans" aria-label="Floor plans" data-floor-plan-gallery="true">${floorPlans}</section>` : ""}
      ${videos ? `<section id="listing-videos" aria-label="Videos" data-listing-videos="true" data-low-bandwidth="metadata-only">${videos}</section>` : ""}
      <section id="listing-tour" aria-label="360 tour" data-photo-sphere-viewer="${escapeHtml(
        tour.available ? tour.mount_target : "review_required",
      )}" data-tour-provider="${escapeHtml(tour.provider || "photo-sphere-viewer")}">
        ${tour.available ? `<p>${escapeHtml(tour.accessibility_caption)}</p>` : `<p>${escapeHtml(tour.review_status || "review required")}</p>`}
      </section>
    </section>
    <aside aria-label="Contact broker" data-listing-contact-panel="true">
      <nav aria-label="Listing actions" data-mobile-sticky-actions="${escapeHtml(page.body.actions.sticky_mobile ? "true" : "false")}">${primary}</nav>
      <nav aria-label="Broker contact" data-broker-contact-actions="true">${direct}</nav>
    </aside>
  </section>
  <section aria-label="Related listings" data-related-listings="true">${related}</section>
</main>`;
}

function renderListingPrint(page) {
  const gallery = (page.body.media.gallery || [])
    .slice(0, 4)
    .map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || page.body.h1)}">`)
    .join("");
  const direct = page.body.actions.direct_contact.channels
    .map((channel) =>
      channel.enabled
        ? `<a href="${escapeHtml(channel.href)}">${escapeHtml(channel.label)}</a>`
        : `<span aria-disabled="true">${escapeHtml(channel.label)}</span>`,
    )
    .join("");
  return `
<style>
@media print {
  a[href]::after { content: " (" attr(href) ")"; font-size: 10pt; }
  nav, section, dl { break-inside: avoid; }
  img { max-width: 48%; height: auto; }
}
</style>
<main data-kind="listing-print" data-print-status="browser-pdf-ready" data-review-status="${escapeHtml(
    page.body.actions.direct_contact.review_status,
  )}">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <p>${escapeHtml(page.metadata.description)}</p>
  <dl>${renderFacts(page.body.facts)}</dl>
  <section aria-label="Listing photos">${gallery}</section>
  <nav aria-label="Broker contact" data-broker-contact-actions="true">${direct}</nav>
  <p><a href="${escapeHtml(page.canonical)}">${escapeHtml(page.canonical)}</a></p>
  <p>${escapeHtml(page.body.source.source_domain)} ${escapeHtml(page.body.source.old_url)}</p>
</main>`;
}

function renderHome(page) {
  const locations = (page.body.locations || [])
    .map((location) => `<a href="${escapeHtml(location.path)}">${escapeHtml(location.location)}</a>`)
    .join("");
  const cards = page.cards
    .map((card) => renderListingCard(card, { actionLabel: "Featured listing actions" }))
    .join("");
  return `
<main data-kind="home">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <form action="${escapeHtml(page.body.search.path)}" method="get" role="search">
    <input name="${escapeHtml(page.body.search.query_param)}" type="search" autocomplete="off">
    <button type="submit">Search</button>
  </form>
  <a href="${escapeHtml(page.body.seller.path)}" data-action="seller">${escapeHtml(page.body.seller.label)}</a>
  <a href="${escapeHtml(page.body.contact.path)}" data-action="contact">${escapeHtml(page.body.contact.label)}</a>
  <nav aria-label="Locations" data-home-locations="true">${locations}</nav>
  <section aria-label="Featured listings" data-featured-listings="true">${cards}</section>
</main>`;
}

function renderSearch(page) {
  const filter = (name, label) => {
    const value = page.search.filters?.[name] || "";
    return `<label>${escapeHtml(label)} <input name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
  };
  const controls = page.search.controls || {};
  const savedSearchFilters = controls.save_search?.payload?.filters || {};
  const hasSavedSearchCriteria = Boolean(String(page.search.query || "").trim() || Object.keys(savedSearchFilters).length);
  const viewModes = (controls.view_modes || [])
    .map(
      (mode) =>
        `<button type="submit" name="view" value="${escapeHtml(mode.id)}" aria-pressed="${escapeHtml(
          mode.default ? "true" : "false",
        )}" data-view-mode="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</button>`,
    )
    .join("");
  const sortOptions = (controls.sort_options || [])
    .map(
      (option) =>
        `<option value="${escapeHtml(option.id)}"${option.default ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    )
    .join("");
  const chips = (controls.active_filter_chips || [])
    .map((chip) => `<span data-filter-chip="${escapeHtml(chip.key)}">${escapeHtml(chip.value)}</span>`)
    .join("");
  const cards = page.cards
    .map((card) => renderListingCard(card, { actionLabel: "Search result actions" }))
    .join("");
  return `
<main data-kind="search" data-total-matches="${escapeHtml(page.search.total_matches)}" data-list-first-mobile="${escapeHtml(
    page.mobile_policy?.list_first_mobile ? "true" : "false",
  )}" data-map-optional="${escapeHtml(page.mobile_policy?.map_optional ? "true" : "false")}" data-min-touch-target="${escapeHtml(
    page.mobile_policy?.minimum_tap_target_px || 44,
  )}">
  <h1>${escapeHtml(page.metadata.title)}</h1>
  <form action="${escapeHtml(page.path)}" method="get" role="search">
    <label>Search <input name="q" type="search" value="${escapeHtml(page.search.query || "")}" autocomplete="off"></label>
    ${filter("location", "Location")}
    ${filter("property_type", "Type")}
    <label>Sort <select name="sort">${sortOptions}</select></label>
    <fieldset data-view-mode-control="true" data-map-optional="${escapeHtml(page.mobile_policy?.map_optional ? "true" : "false")}">
      <legend>View</legend>
      ${viewModes}
    </fieldset>
    <button type="submit">Search</button>
  </form>
  <form method="${escapeHtml(controls.save_search?.method || "POST")}" action="${escapeHtml(
    controls.save_search?.endpoint || "/api/saved-searches",
  )}" data-save-search-endpoint="${escapeHtml(controls.save_search?.endpoint || "/api/saved-searches")}">
    <input type="hidden" name="locale" value="${escapeHtml(page.locale)}">
    <input type="hidden" name="query" value="${escapeHtml(page.search.query || "")}">
    <input type="hidden" name="filters" value="${escapeHtml(JSON.stringify(savedSearchFilters))}">
    <label>Name <input name="contact.name" required autocomplete="name"></label>
    <label>Alert channel <select name="contact_preference"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
    <label>Email <input name="contact.email" type="email" required autocomplete="email"></label>
    <label>Frequency <select name="alertFrequency"><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="instant">As soon as possible</option></select></label>
    <label><input type="checkbox" name="alertConsent" value="true" required> I agree that a broker may contact me about new matches.</label>
    <button type="submit"${hasSavedSearchCriteria ? "" : " disabled"}>Save search</button>
  </form>
  <section aria-label="Active filters" data-active-filters="true" data-active-filter-count="${escapeHtml((controls.active_filter_chips || []).length)}">${chips}</section>
  <p>${escapeHtml(page.search.total_matches)} matches</p>
  <section aria-label="Search results" data-search-results="true">${cards}</section>
</main>`;
}

function renderLocation(page) {
  const cards = page.cards
    .map((card) => renderListingCard(card, { actionLabel: "Location listing actions" }))
    .join("");
  return `
<main data-kind="location" data-location="${escapeHtml(page.body.location)}" data-total-matches="${escapeHtml(page.body.listing_count)}">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <section aria-label="Location listings" data-location-listings="true">${cards}</section>
</main>`;
}

function renderSeller(page) {
  return `
<main data-kind="seller" data-phone-first="true" data-no-public-avm="true" data-broker-review-required="true" data-min-touch-target="44">
  <section aria-label="Seller valuation" data-seller-valuation-flow="broker_callback">
    <h1>${escapeHtml(page.body.h1)}</h1>
    <p>${escapeHtml(page.body.intro)}</p>
    <ol data-seller-steps="true">
      <li>Property details</li>
      <li>Broker review</li>
      <li>Callback</li>
    </ol>
  </section>
  <form method="post" action="${escapeHtml(page.body.valuation.endpoint)}" data-lead-type="seller">
    <input type="hidden" name="source" value="${escapeHtml(page.body.valuation.payload.source)}">
    <input type="hidden" name="leadType" value="${escapeHtml(page.body.valuation.payload.leadType)}">
    <input type="hidden" name="language" value="${escapeHtml(page.body.valuation.payload.language)}">
    <label>Name <input name="contact.name" required autocomplete="name"></label>
    <label>Phone <input name="contact.phone" required autocomplete="tel" inputmode="tel"></label>
    <label>Preferred contact
      <select name="contact_preference">
        <option value="phone">Phone</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="viber">Viber</option>
      </select>
    </label>
    <label>Location <input name="property.location" autocomplete="address-level2"></label>
    <label>Property type <input name="property.type"></label>
    <label>Property details <textarea name="message" required></textarea></label>
    <button type="submit">${escapeHtml(page.body.valuation.label)}</button>
  </form>
</main>`;
}

function renderContact(page) {
  return `
<main data-kind="contact" data-phone-first="true" data-min-touch-target="44">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <p>${escapeHtml(page.body.intro)}</p>
  <form method="post" action="${escapeHtml(page.body.callback.endpoint)}" data-lead-type="general" data-source="${escapeHtml(
    page.body.callback.payload.source,
  )}">
    <input type="hidden" name="source" value="${escapeHtml(page.body.callback.payload.source)}">
    <input type="hidden" name="leadType" value="${escapeHtml(page.body.callback.payload.leadType)}">
    <input type="hidden" name="language" value="${escapeHtml(page.body.callback.payload.language)}">
    <input type="hidden" name="contact_preference" value="${escapeHtml(page.body.callback.payload.contact_preference)}">
    <label>Name <input name="contact.name" required autocomplete="name"></label>
    <label>Message <textarea name="message" required></textarea></label>
    <button type="submit">${escapeHtml(page.body.callback.label)}</button>
  </form>
  <a href="${escapeHtml(page.body.search.path)}" data-action="search">Search</a>
  <a href="${escapeHtml(page.body.seller.path)}" data-action="seller">Seller valuation</a>
</main>`;
}

function renderGuide(page) {
  const sections = (page.body.sections || [])
    .map(
      (section) => `
      <section id="${escapeHtml(section.id)}" data-reviewer="${escapeHtml(section.reviewer)}">
        <h2>${escapeHtml(section.title)}</h2>
        <ul>${section.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
      </section>`,
    )
    .join("");
  return `
<main data-kind="guide" data-approved-source="cms" data-min-touch-target="44">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <p>${escapeHtml(page.body.intro)}</p>
  ${sections}
  <nav aria-label="Guide actions">
    <a href="${escapeHtml(page.body.ctas.search.path)}">Search</a>
    <a href="${escapeHtml(page.body.ctas.seller.path)}">Seller valuation</a>
    <a href="${escapeHtml(page.body.ctas.contact.path)}">Contact</a>
  </nav>
</main>`;
}

function renderFallback(page) {
  return `
<main data-kind="language-fallback">
  <h1>${escapeHtml(page.metadata.title)}</h1>
  <p>${escapeHtml(page.metadata.description)}</p>
  <form method="post" action="/api/language-requests" data-request-language="true">
    <input type="hidden" name="requestedLocale" value="${escapeHtml(page.requested_locale)}">
    <input type="hidden" name="requestedPath" value="${escapeHtml(page.requested_path)}">
    <button type="submit">Request this language</button>
  </form>
</main>`;
}

function renderAdminMigrationReview(page) {
  const gaps = page.dashboard.metadata_gaps || {};
  const metrics = [
    ["URLs", page.routeMap.total],
    ["Review required", page.routeMap.reviewRequired],
    ["Mapped listings", page.routeMap.mappedListings],
    ["Deployable preview", page.deployablePreview.length],
    ["Missing descriptions", gaps.missing_description],
    ["Media rows", page.dashboard.media_reconciliation?.media_rows],
  ]
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  const rows = (page.routeMap.approvableSample || [])
    .map(
      (route) => `
      <tr data-approvable-listing="true">
        <td><code>${escapeHtml(route.old_url)}</code></td>
        <td><code>${escapeHtml(route.target_path)}</code></td>
        <td>${escapeHtml(route.target_locale)}</td>
        <td>
          <form method="post" action="/api/admin/redirect-approvals">
            <input type="hidden" name="oldUrl" value="${escapeHtml(route.old_url)}">
            <input type="hidden" name="equivalentContent" value="true">
            <label>Reviewer <input name="reviewer" required autocomplete="name"></label>
            <label>Reason <input name="reason" value="Reviewed same-content route mapping."></label>
            <button type="submit">Approve 301</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");
  const approvals = page.redirectApprovals
    .map((approval) => `<li><code>${escapeHtml(approval.old_url)}</code> -> <code>${escapeHtml(approval.target_path)}</code></li>`)
    .join("");
  const seoSources = ["search_console", "yandex_webmaster", "backlinks"]
    .map((source) => {
      const status = page.seoEvidence.sources[source];
      return `
      <li>
        <strong>${escapeHtml(source)}</strong>:
        ${escapeHtml(status.status)} · matched ${escapeHtml(status.matched_rows)} / ${escapeHtml(status.row_count)}
        <a href="${escapeHtml(`${page.seoEvidence.templateEndpoint}?source=${source}`)}">CSV template</a>
      </li>`;
    })
    .join("");
  const qualityRows = (page.listingQuality?.rows || [])
    .map(
      (row) => `
      <tr data-quality-listing="true">
        <td><a href="${escapeHtml(row.editor_path)}">${escapeHtml(row.listing_id)}</a></td>
        <td>${escapeHtml(row.source_locale)}</td>
        <td>${escapeHtml(row.location || "missing")}</td>
        <td>${escapeHtml(row.issues.join(", "))}</td>
        <td>${escapeHtml(row.public_gallery_assets)}</td>
        <td>${escapeHtml(row.missing_alt_text_assets)}</td>
        <td>${escapeHtml(row.review_gated_assets)}</td>
      </tr>`,
    )
    .join("");
  const launchBlockers = page.launchBlockers?.blockers || [];
  const launchActionCount = (page.launchBlockers?.blocked_gates || []).reduce(
    (count, gate) => count + (gate.next_actions || []).length,
    0,
  );
  return `
<main data-kind="admin-migration-review" data-admin-locale="${escapeHtml(page.workspace.locale)}" data-review-required="${escapeHtml(
    page.routeMap.reviewRequired,
  )}" data-launch-status="${escapeHtml(page.launchBlockers?.status || "unknown")}" data-launch-blockers="${escapeHtml(
    launchBlockers.join(","),
  )}" data-launch-action-count="${escapeHtml(
    launchActionCount,
  )}" data-launch-readiness-endpoint="${escapeHtml(page.launchReadinessEndpoint)}" data-launch-readiness-export-endpoint="${escapeHtml(
    page.launchReadinessExportEndpoint,
  )}" data-launch-input-checklist-endpoint="${escapeHtml(
    page.launchInputChecklistEndpoint,
  )}" data-preflight-reports-endpoint="${escapeHtml(
    page.preflightReportsEndpoint,
  )}" data-seo-preflight-endpoint="${escapeHtml(
    page.seoPreflightEndpoint,
  )}" data-live-services-endpoint="${escapeHtml(
    page.liveServicesEndpoint,
  )}" data-live-service-provisioning-endpoint="${escapeHtml(
    page.liveServiceProvisioningEndpoint,
  )}" data-live-service-provisioning-import-endpoint="${escapeHtml(
    page.liveServiceProvisioningImportEndpoint,
  )}" data-payload-runtime-endpoint="${escapeHtml(
    page.payloadRuntimeEndpoint,
  )}" data-payload-runtime-bootstrap-endpoint="${escapeHtml(
    page.payloadRuntimeBootstrapEndpoint,
  )}" data-cms-collections-endpoint="${escapeHtml(
    page.cmsCollectionsEndpoint,
  )}" data-payload-collections-endpoint="${escapeHtml(
    page.payloadCollectionsEndpoint,
  )}" data-listing-quality-endpoint="${escapeHtml(
    page.listingQualityEndpoint,
  )}">
  <h1>Migration review</h1>
  <p><a href="${escapeHtml(page.launchReadinessEndpoint)}">Launch readiness JSON</a></p>
  <p><a href="${escapeHtml(page.launchInputChecklistEndpoint)}">Launch input checklist</a></p>
  <p><a href="${escapeHtml(page.preflightReportsEndpoint)}">Preflight reports JSON</a></p>
  <p><a href="${escapeHtml(page.seoPreflightEndpoint)}">SEO preflight JSON</a></p>
  <p><a href="${escapeHtml(page.liveServicesEndpoint)}">Live services JSON</a></p>
  <p><a href="${escapeHtml(page.liveServiceProvisioningEndpoint)}">Live service provisioning JSON</a></p>
  <p><a href="${escapeHtml(page.payloadRuntimeEndpoint)}">Payload runtime JSON</a></p>
  <p><a href="${escapeHtml(page.payloadRuntimeBootstrapEndpoint)}">Payload runtime bootstrap JSON</a></p>
  <p><a href="${escapeHtml(page.cmsCollectionsEndpoint)}">CMS collection contracts</a></p>
  <p><a href="${escapeHtml(page.payloadCollectionsEndpoint)}">Payload collection configs</a></p>
  <p><a href="${escapeHtml(page.listingQualityEndpoint)}">Listing quality JSON</a></p>
  <form method="post" action="${escapeHtml(page.launchReadinessExportEndpoint)}">
    <button type="submit">Export launch readiness</button>
  </form>
  <dl>${metrics}</dl>
  <section aria-label="Approvable listing redirects">
    <h2>Approvable listing redirects</h2>
    <table>
      <thead><tr><th>Old URL</th><th>Target</th><th>Locale</th><th>Approval</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <section aria-label="Redirect approval CSV import" data-redirect-import-endpoint="${escapeHtml(
    page.redirectApprovalImport.endpoint,
  )}" data-redirect-export-endpoint="${escapeHtml(
    page.redirectApprovalImport.exportEndpoint,
  )}" data-redirect-workbook-endpoint="${escapeHtml(page.redirectApprovalImport.workbookEndpoint)}" data-pending-redirect-workbook-endpoint="${escapeHtml(
    page.redirectApprovalImport.pendingWorkbookEndpoint,
  )}">
    <h2>Import reviewed redirect CSV</h2>
    <p><a href="${escapeHtml(page.redirectApprovalImport.pendingWorkbookEndpoint)}">Download pending workbook</a>, review rows, then paste approved CSV.</p>
    <form method="post" action="${escapeHtml(page.redirectApprovalImport.endpoint)}">
      <textarea name="csv" rows="5" required></textarea>
      <button type="submit">Import CSV</button>
    </form>
    <form method="post" action="${escapeHtml(page.redirectApprovalImport.exportEndpoint)}">
      <button type="submit">Export deployable redirects</button>
    </form>
  </section>
  <section aria-label="External SEO evidence" data-seo-import-endpoint="${escapeHtml(page.seoEvidence.importEndpoint)}" data-seo-template-endpoint="${escapeHtml(
    page.seoEvidence.templateEndpoint,
  )}">
    <h2>External SEO evidence</h2>
    <p>Missing required sources: ${escapeHtml(page.seoEvidence.missingRequiredSources.join(", ") || "none")}</p>
    <ul>${seoSources}</ul>
    <form method="post" action="${escapeHtml(page.seoEvidence.importEndpoint)}">
      <label>Source
        <select name="source" required>
          <option value="search_console">Search Console</option>
          <option value="yandex_webmaster">Yandex Webmaster</option>
          <option value="backlinks">Backlinks</option>
        </select>
      </label>
      <textarea name="csv" rows="5" required></textarea>
      <button type="submit">Import SEO CSV</button>
    </form>
  </section>
  <section aria-label="Listing quality queue" data-quality-workbook-endpoint="${escapeHtml(
    page.listingQualityWorkbookEndpoint,
  )}" data-quality-review-draft-endpoint="${escapeHtml(
    page.listingQualityReviewDraftEndpoint,
  )}" data-quality-import-endpoint="${escapeHtml(
    page.listingQualityImportEndpoint,
  )}" data-quality-affected-listings="${escapeHtml(
    page.listingQuality?.summary?.affected_listings || 0,
  )}">
    <h2>Listing quality queue</h2>
    <p><a href="${escapeHtml(page.listingQualityWorkbookEndpoint)}">Download listing quality workbook</a></p>
    <p><a href="${escapeHtml(page.listingQualityReviewDraftEndpoint)}">Download listing quality review draft</a></p>
    <form method="post" action="${escapeHtml(page.listingQualityImportEndpoint)}">
      <textarea name="csv" rows="5" required></textarea>
      <button type="submit">Import listing quality CSV</button>
    </form>
    <p>Issues: ${escapeHtml(JSON.stringify(page.listingQuality?.summary?.issue_counts || {}))}</p>
    <table>
      <thead><tr><th>Listing</th><th>Locale</th><th>Location</th><th>Issues</th><th>Public photos</th><th>Missing alt</th><th>Review-gated media</th></tr></thead>
      <tbody>${qualityRows}</tbody>
    </table>
  </section>
  <section aria-label="Approved redirects">
    <h2>Approved redirects</h2>
    <ul>${approvals}</ul>
  </section>
</main>`;
}

function renderAdminLeadInbox(page) {
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const communicationByLeadId = new Map((page.communicationThreads || []).map((thread) => [thread.lead_id, thread]));
  const metrics = [
    ["Leads", page.summary.leads],
    ["Replies queued", page.summary.replies],
    ["SLA reminders", page.summary.leadSlaReminders],
    ["Manager escalations", page.summary.leadSlaManagerEscalations],
    ["Language requests", page.summary.languageRequests],
    ["Viewings", page.summary.viewings],
    ["Saved searches", page.summary.savedSearches],
    ["Seller pipeline", page.summary.sellerPipeline],
  ]
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  const leads = page.leads
    .map((lead) => {
      const leadSla = leadSlaById.get(lead.lead_id);
      const slaStatus = leadSla?.status || "pending";
      const slaLabel = slaStatus.replaceAll("_", " ");
      const escalationDue = leadSla?.manager_escalation_due_at || "";
      const brokerId = lead.broker_assignment?.broker_id || lead.assigned_broker || "";
      const templates = page.communicationTemplates?.[lead.lead_id] || [];
      const templateOptions = templates
        .map(
          (template) =>
            `<option value="${escapeHtml(template.id)}" data-template-body="${escapeHtml(template.body)}" data-template-locale="${escapeHtml(template.locale)}" data-template-channel="${escapeHtml(template.preferred_channel)}">${escapeHtml(`${template.kind} · ${template.locale.toUpperCase()} · ${template.preferred_channel}`)}</option>`,
        )
        .join("");
      const thread = communicationByLeadId.get(lead.lead_id);
      const threadEvents = (thread?.events || [])
        .map(
          (event) =>
            `<li data-communication-event="${escapeHtml(event.type)}"><strong>${escapeHtml(event.type.replaceAll("_", " "))}</strong> <time datetime="${escapeHtml(event.occurred_at || "")}">${escapeHtml(event.occurred_at || "")}</time><p>${escapeHtml(event.body || "No message body was provided.")}</p></li>`,
        )
        .join("");
      return `
      <tr data-lead-row="true" data-lead-id="${escapeHtml(lead.lead_id)}" data-lead-type="${escapeHtml(
        lead.lead_type,
      )}" data-original-language="${escapeHtml(lead.original_language)}" data-admin-locale="${escapeHtml(
        lead.admin_locale,
      )}" data-contact-preference="${escapeHtml(lead.contact_preference)}" data-broker-assignment="${escapeHtml(brokerId)}">
        <td><code>${escapeHtml(lead.lead_id)}</code>${thread ? `<details data-communication-thread="${escapeHtml(lead.lead_id)}"><summary>Communication history (${escapeHtml(thread.event_count)})</summary><ol>${threadEvents}</ol></details>` : ""}</td>
        <td>${escapeHtml(lead.lead_type)}</td>
        <td>${escapeHtml(lead.source)}</td>
        <td>${escapeHtml(lead.original_language)} -> ${escapeHtml(lead.admin_locale)}</td>
        <td>${escapeHtml(lead.contact_preference)}</td>
        <td data-sla-status="${escapeHtml(slaStatus)}">${escapeHtml(slaLabel)}</td>
        <td>${escapeHtml(escalationDue)}</td>
        <td>
          <form method="post" action="/api/admin/replies/draft" data-hermes-draft-request="true" data-hermes-draft-endpoint="/api/admin/replies/draft" data-original-language="${escapeHtml(
            lead.original_language,
          )}">
            <input type="hidden" name="leadId" value="${escapeHtml(lead.lead_id)}">
            <input type="hidden" name="language" value="${escapeHtml(lead.original_language)}">
            <button type="submit">Draft with Hermes</button>
          </form>
          <form method="post" action="/api/admin/replies" data-reply-approval-required="true" data-hermes-reply-draft="broker_review_required" data-original-language="${escapeHtml(
            lead.original_language,
          )}">
            <input type="hidden" name="leadId" value="${escapeHtml(lead.lead_id)}">
            <input type="hidden" name="language" value="${escapeHtml(lead.original_language)}">
            <input type="hidden" name="approved" value="true">
            ${templates.length ? `<label>Reply template <select name="replyTemplate" data-communication-template-select="true"><option value="">Choose a reviewable starting template</option>${templateOptions}</select></label><small>Check the facts and edit the text before approval.</small>` : ""}
            <label data-show-original-toggle="true"><input type="checkbox" name="showOriginal"> Show original</label>
            <label>Hermes draft text <textarea name="hermesDraftText"></textarea></label>
            <label>Reviewer <input name="reviewer" required autocomplete="name"></label>
            <label>Reviewed reply <textarea name="reviewedReply" required></textarea></label>
            <button type="submit">Queue reply</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");
  const requests = page.languageRequests
    .map((request) => `<li>${escapeHtml(request.requested_locale)} -> ${escapeHtml(request.fallback_locale)}</li>`)
    .join("");
  return `
<main data-kind="admin-lead-inbox" data-admin-workbench="crm" data-inbox-layout="list-detail-action" data-lead-count="${escapeHtml(
    page.summary.leads,
  )}" data-sla-reminders="${escapeHtml(page.summary.leadSlaReminders)}" data-admin-locale="${escapeHtml(
    page.workspace.locale,
  )}" data-interface-locales="${escapeHtml(
    page.workspace.interface_locales.join(","),
  )}">
  <h1>${escapeHtml(page.workspace.modules.find((module) => module.id === "crm")?.primary_view || "Lead inbox")}</h1>
  <dl>${metrics}</dl>
  <nav aria-label="Lead queues" data-lead-queue-tabs="true">
    <button type="button" data-lead-filter="all">All</button>
    <button type="button" data-lead-filter="needs_reply">Needs reply</button>
    <button type="button" data-lead-filter="sla">SLA</button>
  </nav>
  <section aria-label="CRM leads">
    <h2>CRM leads</h2>
    <table>
      <thead><tr><th>Lead</th><th>Type</th><th>Source</th><th>Language</th><th>Contact</th><th>SLA</th><th>Escalation due</th><th>Reply</th></tr></thead>
      <tbody>${leads}</tbody>
    </table>
  </section>
  <section aria-label="Language requests">
    <h2>Language requests</h2>
    <ul>${requests}</ul>
  </section>
</main>`;
}

function renderAdminListingEditor(page) {
  const facts = page.listing.facts || {};
  const staleTranslations = page.translationTasks.filter((task) => task.status === "stale");
  const inputFor = (field) => {
    const value = facts[field] ?? "";
    if (field === "description") {
      return `<textarea name="${escapeHtml(field)}">${escapeHtml(value)}</textarea>`;
    }
    return `<input name="${escapeHtml(field)}" value="${escapeHtml(value)}">`;
  };
  const fields = page.editableFields
    .map((field) => `<label>${escapeHtml(field.replaceAll("_", " "))} ${inputFor(field)}</label>`)
    .join("");
  const translations = (page.listing.translations || [])
    .map(
      (translation) =>
        `<li data-translation-locale="${escapeHtml(translation.locale)}" data-translation-status="${escapeHtml(
          translation.status,
        )}">${escapeHtml(translation.locale)}: ${escapeHtml(translation.status)}</li>`,
    )
    .join("");
  const staleTasks = staleTranslations
    .map(
      (task) =>
        `<li data-translation-locale="${escapeHtml(task.target_locale || task.locale)}" data-translation-status="stale">${escapeHtml(
          task.target_locale || task.locale,
        )} stale</li>`,
    )
    .join("");
  return `
<main data-kind="admin-listing-editor" data-admin-workbench="cms" data-editor-layout="facts-translations-quality" data-cms-status="${escapeHtml(
    page.listing.cms_status,
  )}" data-schema-ready="${escapeHtml(page.listing.seo?.schema_present ? "true" : "false")}" data-stale-translation-count="${escapeHtml(
    staleTranslations.length,
  )}" data-listing-id="${escapeHtml(page.listing.id)}" data-admin-locale="${escapeHtml(
    page.workspace.locale,
  )}">
  <h1>Property editor</h1>
  <p>${escapeHtml(page.listing.source_domain)} ${escapeHtml(page.listing.source_locale)}</p>
  <nav aria-label="Editor sections" data-editor-tabs="true">
    <a href="#listing-facts" data-editor-tab="facts">Facts</a>
    <a href="#listing-translations" data-editor-tab="translations">Translations</a>
    <a href="#listing-media" data-editor-tab="media">Media</a>
    <a href="#listing-quality" data-editor-tab="quality">Quality</a>
  </nav>
  <form id="listing-facts" method="post" action="/api/admin/listings/edit" data-editor-form="listing" data-editor-panel="facts">
    <input type="hidden" name="listingId" value="${escapeHtml(page.listing.id)}">
    <label>Editor <input name="editor" required autocomplete="name"></label>
    ${fields}
    <button type="submit">Save source edit</button>
  </form>
  <section id="listing-translations" aria-label="Translation state" data-translation-panel="true">
    <h2>Translation state</h2>
    <ul>${translations}${staleTasks}</ul>
  </section>
  <section id="listing-media" aria-label="Media review" data-media-review-panel="true" data-tour-review-status="${escapeHtml(
    page.listing.tour?.available ? "available" : "review_required",
  )}">
    <h2>Media review</h2>
    <dl>
      <dt>Media assets</dt><dd>${escapeHtml((page.listing.media || []).length)}</dd>
      <dt>Public tour</dt><dd>${escapeHtml(page.listing.tour?.available ? "available" : "review required")}</dd>
    </dl>
  </section>
  <section id="listing-quality" aria-label="Quality" data-quality-panel="true">
    <h2>Quality</h2>
    <dl>
      <dt>CMS status</dt><dd>${escapeHtml(page.listing.cms_status)}</dd>
      <dt>Schema</dt><dd>${escapeHtml(page.listing.seo?.schema_present ? "present" : "missing")}</dd>
    </dl>
  </section>
</main>`;
}

function renderBody(page, options = {}) {
  if (!options.legacyBody && !options.print) {
    const publicBody = renderReactPublicBody(page);
    if (publicBody) return publicBody;
    const adminBody = renderReactAdminBody(page);
    if (adminBody) return adminBody;
  }
  if (page.kind === "home") return renderHome(page);
  if (page.kind === "listing" && options.print) return renderListingPrint(page);
  if (page.kind === "listing") return renderListing(page);
  if (page.kind === "search") return renderSearch(page);
  if (page.kind === "location") return renderLocation(page);
  if (page.kind === "seller") return renderSeller(page);
  if (page.kind === "contact") return renderContact(page);
  if (page.kind === "guide") return renderGuide(page);
  if (page.kind === "language_fallback") return renderFallback(page);
  if (page.kind === "admin_migration_review") return renderAdminMigrationReview(page);
  if (page.kind === "admin_lead_inbox") return renderAdminLeadInbox(page);
  if (page.kind === "admin_listing_editor") return renderAdminListingEditor(page);
  return `<main data-kind="not-found"><h1>Not found</h1></main>`;
}

function clientScript(page, options = {}) {
  if (options.print) return "";
  if (String(page.kind || "").startsWith("admin_")) {
    return `<script defer src="/vendor/ms-realty-admin.js?v=${ADMIN_CLIENT_HASH}"></script>`;
  }
  const copy = chromeCopyFor(page.locale || page.lang || "en");
  return `<script defer src="/vendor/ms-realty-public.js?v=${PUBLIC_CLIENT_HASH}" data-ms-realty-public-client data-request-sent="${escapeHtml(copy.requestSent)}" data-request-failed="${escapeHtml(copy.requestFailed || "")}"></script>`;
}

export function renderHtmlPage(page, options = {}) {
  const body = options.bodyHtml || renderBody(page, options);
  return `<!doctype html>
<html lang="${escapeHtml(page.lang || page.locale || "en")}" dir="${escapeHtml(page.dir || "ltr")}">
<head>
${meta(page)}
</head>
<body>
${body}
${clientScript(page, options)}
</body>
</html>`;
}

export function assertHtmlPage(html, { lang, dir, kind }) {
  if (!html.startsWith("<!doctype html>")) throw new Error("HTML response must be a document");
  if (!html.includes(`<html lang="${lang}" dir="${dir}">`)) throw new Error("HTML response must set lang and dir");
  if (!html.includes(`data-kind="${kind}"`)) throw new Error("HTML response must render the expected page kind");
  if (!html.includes("<link rel=\"canonical\"")) throw new Error("HTML response must include canonical metadata");
  if (!html.includes("property=\"og:title\"")) throw new Error("HTML response must include Open Graph metadata");
  return true;
}
