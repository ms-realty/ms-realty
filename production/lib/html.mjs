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
  return `<style data-ms-realty-design-system="inline">
:root{--stone-50:#FAF7F1;--stone-100:#F2ECE1;--stone-200:#E6DCCB;--stone-300:#D3C4AC;--stone-500:#948263;--stone-700:#574B38;--stone-800:#3A3227;--stone-900:#241F18;--ink-50:#F4F4F3;--ink-100:#E6E6E5;--ink-600:#3F3F3F;--ink-800:#222222;--ink-900:#181818;--brick-50:#FCEBEB;--brick-500:#DB3E3E;--brick-600:#C42D2D;--brick-700:#A32323;--danger-50:#F9E7EA;--danger-600:#9E2334;--canvas:var(--stone-50);--surface:#fff;--surface-sunken:var(--stone-100);--surface-hover:var(--stone-100);--surface-inverse:var(--ink-900);--text-strong:var(--stone-900);--text-body:var(--stone-800);--text-muted:var(--stone-500);--text-on-dark:var(--stone-50);--text-link:var(--ink-800);--border:var(--stone-200);--border-strong:var(--stone-300);--brand:var(--ink-800);--brand-hover:var(--ink-900);--accent:var(--brick-600);--accent-hover:var(--brick-700);--accent-subtle:var(--brick-50);--price:var(--ink-900);--ring:rgba(219,62,62,.45);--font-display:'Source Serif 4','Noto Serif Hebrew',Georgia,serif;--font-sans:'Commissioner','Noto Sans Hebrew',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;--font-mono:'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;--space-5:1.25rem;--space-6:1.5rem;--space-8:2rem;--space-10:2.5rem;--space-12:3rem;--gutter:1.5rem;--container-md:820px;--container-xl:1280px;--radius-button:8px;--radius-input:8px;--radius-card:14px;--radius-pill:999px;--shadow-card:0 1px 2px rgba(22,19,14,.06),0 2px 6px rgba(22,19,14,.06);--shadow-card-hover:0 6px 10px rgba(22,19,14,.06),0 16px 32px rgba(22,19,14,.12);--shadow-focus:0 0 0 3px var(--ring)}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;background:var(--canvas)}body{margin:0;background:var(--canvas);color:var(--text-body);font-family:var(--font-sans);font-size:17px;line-height:1.5;font-weight:400;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}body::before{content:"";display:block;height:6px;background:linear-gradient(90deg,var(--brick-500),var(--ink-800))}
h1,h2,h3{margin:0;color:var(--text-strong);font-family:var(--font-display);font-weight:600;line-height:1.12;letter-spacing:0}h1{font-size:40px;max-width:18ch}h2{font-size:24px}p{margin:0}a{color:var(--text-link);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}img,svg,video{display:block;max-width:100%}code{font-family:var(--font-mono);font-size:.92em;color:var(--ink-800)}
main{width:min(100%,var(--container-xl));margin:0 auto;padding:var(--space-8) var(--gutter) var(--space-12);display:grid;gap:var(--space-6)}main[data-kind="language-fallback"],main[data-kind="contact"],main[data-kind="seller"]{width:min(100%,var(--container-md))}
button,input,textarea,select{min-height:44px;font:inherit;color:inherit}button,a[data-action],nav[aria-label="Listing actions"] button,article[data-search-card] nav button{border:1px solid var(--brand);border-radius:var(--radius-button);background:var(--brand);color:#fff;padding:.72rem 1rem;font-weight:600;cursor:pointer}button:hover,a[data-action]:hover,nav[aria-label="Listing actions"] button:hover,article[data-search-card] nav button:hover{background:var(--brand-hover);text-decoration:none}input,textarea,select{width:100%;border:1px solid var(--border-strong);border-radius:var(--radius-input);background:var(--surface);padding:.7rem .82rem}textarea{min-height:7rem;resize:vertical}label{display:grid;gap:.35rem;color:var(--text-strong);font-weight:600}:focus-visible{outline:none;box-shadow:var(--shadow-focus)}
form[role="search"],main[data-kind="seller"] form,main[data-kind="contact"] form,form[data-editor-form="listing"]{display:grid;gap:var(--space-4);padding:var(--space-5);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}form[role="search"]{grid-template-columns:2fr 1fr 1fr 1fr auto;align-items:end}fieldset{margin:0;border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--space-3);display:flex;gap:var(--space-2);align-items:center}legend{padding:0 var(--space-2);color:var(--text-muted);font-weight:600}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);margin:0}dt{color:var(--text-muted);font-size:13px;font-weight:600}dd{margin:0;color:var(--text-strong);font-weight:600}table{width:100%;border-collapse:collapse;background:var(--surface)}th,td{padding:.85rem;text-align:start;border-bottom:1px solid var(--border);vertical-align:top}th{background:var(--surface-sunken);color:var(--text-muted);font-size:13px;font-weight:700}section:has(> table){overflow-x:auto}
article[data-search-card="true"],article[data-related-listing="true"],main[data-kind="home"] section article{display:grid;gap:var(--space-3);padding:var(--space-5);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}article[data-search-card="true"]:hover{box-shadow:var(--shadow-card-hover);transform:translateY(-2px)}[data-card-badge],[data-listing-verification]{width:max-content;border-radius:var(--radius-pill);background:var(--ink-100);color:var(--ink-800);padding:.25rem .6rem;font-size:13px;font-weight:700}[data-card-price],[data-listing-price]{font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--price)}
main[data-kind="search"] section[aria-label="Search results"],main[data-kind="home"] section[aria-label="Featured listings"],section[aria-label="Related listings"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--space-5)}section[aria-label="Active filters"]{display:flex;flex-wrap:wrap;gap:var(--space-2)}[data-filter-chip]{border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--surface);padding:.35rem .7rem;color:var(--text-muted);font-weight:600}article[data-search-card] nav,nav[aria-label="Save and share"],nav[aria-label="Broker contact"],nav[aria-label="Locations"]{display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center}
main[data-kind="listing"]{grid-template-columns:minmax(0,1fr) 320px;align-items:start}main[data-kind="listing"]>[data-listing-summary]{grid-column:1/-1;display:grid;gap:var(--space-3);padding:var(--space-6);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}[data-listing-highlights]{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:0;margin:0;list-style:none}[data-listing-highlights] li{border-radius:var(--radius-pill);background:var(--surface-sunken);padding:.35rem .7rem;font-weight:600}#listing-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3)}#listing-gallery img{width:100%;height:180px;object-fit:cover;border-radius:var(--radius-card);background:var(--surface-sunken)}nav[data-mobile-sticky-actions="true"]{position:sticky;bottom:0;z-index:10;display:grid;gap:var(--space-2);padding:var(--space-3);background:rgba(255,255,255,.96);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}
main[data-kind="seller"]>section,main[data-kind="contact"]>p,main[data-kind="guide"]>section{display:grid;gap:var(--space-3)}[data-seller-steps]{display:grid;gap:var(--space-2);padding:0;margin:0;list-style:none}[data-seller-steps] li{padding:.75rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}
main[data-admin-workbench]{width:min(100%,1440px)}main[data-admin-workbench] dl,main[data-kind="admin-migration-review"] dl{padding:var(--space-5);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card)}main[data-admin-workbench]>section,main[data-kind="admin-migration-review"]>section{padding:var(--space-5);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card);display:grid;gap:var(--space-4)}nav[data-lead-queue-tabs],nav[data-editor-tabs]{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:var(--space-2);background:var(--surface-sunken);border:1px solid var(--border);border-radius:var(--radius-card)}nav[data-editor-tabs] a,nav[data-lead-queue-tabs] button{background:var(--surface);color:var(--brand);border-color:var(--border);box-shadow:var(--shadow-card)}form[data-reply-approval-required]{display:grid;gap:var(--space-3);min-width:260px}
@media (max-width:900px){main,main[data-kind="listing"]{display:grid;grid-template-columns:1fr;padding:var(--space-5) var(--space-4) var(--space-10)}h1{font-size:32px}form[role="search"]{grid-template-columns:1fr}fieldset{display:grid}table{min-width:760px}nav[data-mobile-sticky-actions="true"]{margin-inline:calc(var(--space-4) * -1);border-radius:0;border-inline:0}}
</style>`;
}

function openGraph(page) {
  const title = page.metadata?.title || "MS Realty";
  const description = page.metadata?.description || "";
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
    .map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || page.body.h1)}" loading="lazy">`)
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
      )}">${escapeHtml(action.label)}</button>`;
    })
    .join("");
  const related = (page.body.related_listings || [])
    .map((card) => `<article data-related-listing="true"><h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2></article>`)
    .join("");
  const tour = page.body.media.tour || {};
  return `
<main data-kind="listing" data-review-status="${escapeHtml(page.body.actions.direct_contact.review_status)}" data-listing-status="${escapeHtml(
    page.body.lifecycle?.status || "available",
  )}" data-active-in-search="${escapeHtml(page.body.lifecycle?.active_in_search ? "true" : "false")}" data-min-touch-target="44">
  <section aria-label="Listing summary" data-listing-summary="true" data-source-domain="${escapeHtml(
    page.body.source.source_domain,
  )}" data-schema-ready="${escapeHtml(page.schema ? "true" : "false")}">
    <p data-listing-verification="true">${escapeHtml(page.translation.human_approved ? "reviewed translation" : "approved source")}</p>
    <h1>${escapeHtml(page.body.h1)}</h1>
    <p data-listing-price="true">${escapeHtml(listingPriceLabel(page.body.facts))}</p>
    <ul data-listing-highlights="true">${listingHighlights(page.body.facts)}</ul>
  </section>
  <p>${escapeHtml(page.body.description || "")}</p>
  <dl>${renderFacts(page.body.facts)}</dl>
  <nav aria-label="Listing media" data-media-gallery-count="${escapeHtml(
    page.body.media.gallery_count || 0,
  )}" data-tour-status="${escapeHtml(tour.available ? "available" : tour.review_status || "review_required")}">
    <a href="#listing-gallery">Photos</a>
    <a href="#listing-tour" aria-disabled="${escapeHtml(tour.available ? "false" : "true")}">360</a>
  </nav>
  <section id="listing-gallery" aria-label="Gallery" data-photo-carousel="true">${gallery}</section>
  <section id="listing-tour" aria-label="360 tour" data-photo-sphere-viewer="${escapeHtml(
    tour.available ? tour.mount_target : "review_required",
  )}" data-tour-provider="${escapeHtml(tour.provider || "photo-sphere-viewer")}">
    ${tour.available ? `<p>${escapeHtml(tour.accessibility_caption)}</p>` : `<p>${escapeHtml(tour.review_status || "review required")}</p>`}
  </section>
  <section aria-label="Related listings">${related}</section>
  <nav aria-label="Listing actions" data-mobile-sticky-actions="${escapeHtml(page.body.actions.sticky_mobile ? "true" : "false")}">${primary}</nav>
  <nav aria-label="Save and share">${secondary}</nav>
  <nav aria-label="Broker contact">${direct}</nav>
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
  <nav aria-label="Broker contact">${direct}</nav>
  <p><a href="${escapeHtml(page.canonical)}">${escapeHtml(page.canonical)}</a></p>
  <p>${escapeHtml(page.body.source.source_domain)} ${escapeHtml(page.body.source.old_url)}</p>
</main>`;
}

function renderHome(page) {
  const locations = (page.body.locations || [])
    .map((location) => `<a href="${escapeHtml(location.path)}">${escapeHtml(location.location)}</a>`)
    .join("");
  const cards = page.cards
    .map(
      (card) =>
        `<article><h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2><p>${escapeHtml(card.location)}</p></article>`,
    )
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
  <nav aria-label="Locations">${locations}</nav>
  <section aria-label="Featured listings">${cards}</section>
</main>`;
}

function renderSearch(page) {
  const filter = (name, label) => {
    const value = page.search.filters?.[name] || "";
    return `<label>${escapeHtml(label)} <input name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
  };
  const controls = page.search.controls || {};
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
    .map(
      (card) =>
        `<article data-search-card="true" data-listing-id="${escapeHtml(card.id)}" data-translation-display="${escapeHtml(
          card.translation_display,
        )}" data-review-badge="${escapeHtml(card.review_badge)}" data-listing-status="${escapeHtml(card.listing_status)}">
          <p data-card-badge="true">${escapeHtml(card.review_badge.replaceAll("_", " "))}</p>
          <h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2>
          <p data-card-price="true">${escapeHtml(formatPrice(card))}</p>
          <p data-search-card-meta="true">${escapeHtml(cardSummary(card))}</p>
          <p data-card-media-count="${escapeHtml(card.image_count)}">${escapeHtml(card.image_count)} photos</p>
          <nav aria-label="Search result actions">
            <a href="${escapeHtml(card.actions.detail.href)}">${escapeHtml(card.actions.detail.label)}</a>
            <button type="button" data-endpoint="${escapeHtml(card.actions.inquiry.endpoint)}" data-listing-reference="${escapeHtml(
              card.actions.inquiry.payload.listingReference,
            )}">${escapeHtml(card.actions.inquiry.label)}</button>
            <button type="button" data-client-save-listing="${escapeHtml(card.actions.save.listing_id)}">${escapeHtml(
              card.actions.save.label,
            )}</button>
          </nav>
        </article>`,
    )
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
    <input type="hidden" name="language" value="${escapeHtml(page.locale)}">
    <input type="hidden" name="query" value="${escapeHtml(page.search.query || "")}">
    <button type="submit">Save search</button>
  </form>
  <section aria-label="Active filters" data-active-filter-count="${escapeHtml((controls.active_filter_chips || []).length)}">${chips}</section>
  <p>${escapeHtml(page.search.total_matches)} matches</p>
  <section aria-label="Search results">${cards}</section>
</main>`;
}

function renderLocation(page) {
  const cards = page.cards
    .map(
      (card) =>
        `<article><h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2><p>${escapeHtml(card.property_type)}</p></article>`,
    )
    .join("");
  return `
<main data-kind="location" data-location="${escapeHtml(page.body.location)}" data-total-matches="${escapeHtml(page.body.listing_count)}">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <section aria-label="Location listings">${cards}</section>
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
  <a href="/api/language-requests" data-method="POST">Request this language</a>
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
  return `
<main data-kind="admin-migration-review" data-admin-locale="${escapeHtml(page.workspace.locale)}" data-review-required="${escapeHtml(
    page.routeMap.reviewRequired,
  )}" data-launch-readiness-endpoint="${escapeHtml(page.launchReadinessEndpoint)}" data-launch-readiness-export-endpoint="${escapeHtml(
    page.launchReadinessExportEndpoint,
  )}" data-launch-input-checklist-endpoint="${escapeHtml(
    page.launchInputChecklistEndpoint,
  )}" data-preflight-reports-endpoint="${escapeHtml(
    page.preflightReportsEndpoint,
  )}" data-cms-collections-endpoint="${escapeHtml(
    page.cmsCollectionsEndpoint,
  )}" data-payload-collections-endpoint="${escapeHtml(
    page.payloadCollectionsEndpoint,
  )}">
  <h1>Migration review</h1>
  <p><a href="${escapeHtml(page.launchReadinessEndpoint)}">Launch readiness JSON</a></p>
  <p><a href="${escapeHtml(page.launchInputChecklistEndpoint)}">Launch input checklist</a></p>
  <p><a href="${escapeHtml(page.preflightReportsEndpoint)}">Preflight reports JSON</a></p>
  <p><a href="${escapeHtml(page.cmsCollectionsEndpoint)}">CMS collection contracts</a></p>
  <p><a href="${escapeHtml(page.payloadCollectionsEndpoint)}">Payload collection configs</a></p>
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
  )}" data-quality-import-endpoint="${escapeHtml(
    page.listingQualityImportEndpoint,
  )}" data-quality-affected-listings="${escapeHtml(
    page.listingQuality?.summary?.affected_listings || 0,
  )}">
    <h2>Listing quality queue</h2>
    <p><a href="${escapeHtml(page.listingQualityWorkbookEndpoint)}">Download listing quality workbook</a></p>
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
      const brokerId = lead.broker_assignment?.broker_id || "";
      return `
      <tr data-lead-row="true" data-lead-id="${escapeHtml(lead.lead_id)}" data-lead-type="${escapeHtml(
        lead.lead_type,
      )}" data-original-language="${escapeHtml(lead.original_language)}" data-admin-locale="${escapeHtml(
        lead.admin_locale,
      )}" data-contact-preference="${escapeHtml(lead.contact_preference)}" data-broker-assignment="${escapeHtml(brokerId)}">
        <td><code>${escapeHtml(lead.lead_id)}</code></td>
        <td>${escapeHtml(lead.lead_type)}</td>
        <td>${escapeHtml(lead.source)}</td>
        <td>${escapeHtml(lead.original_language)} -> ${escapeHtml(lead.admin_locale)}</td>
        <td>${escapeHtml(lead.contact_preference)}</td>
        <td data-sla-status="${escapeHtml(slaStatus)}">${escapeHtml(slaLabel)}</td>
        <td>${escapeHtml(escalationDue)}</td>
        <td>
          <form method="post" action="/api/admin/replies" data-reply-approval-required="true" data-hermes-reply-draft="broker_review_required" data-original-language="${escapeHtml(
            lead.original_language,
          )}">
            <input type="hidden" name="leadId" value="${escapeHtml(lead.lead_id)}">
            <input type="hidden" name="language" value="${escapeHtml(lead.original_language)}">
            <input type="hidden" name="approved" value="true">
            <input type="hidden" name="hermesDraft" value="true">
            <label data-show-original-toggle="true"><input type="checkbox" name="showOriginal"> Show original</label>
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

export function renderHtmlPage(page, options = {}) {
  const body = options.bodyHtml || renderBody(page, options);
  return `<!doctype html>
<html lang="${escapeHtml(page.lang || page.locale || "en")}" dir="${escapeHtml(page.dir || "ltr")}">
<head>
${meta(page)}
</head>
<body>
${body}
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
