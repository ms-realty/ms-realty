function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
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
  return `
<main data-kind="listing" data-review-status="${escapeHtml(page.body.actions.direct_contact.review_status)}">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <dl>${renderFacts(page.body.facts)}</dl>
  <section aria-label="Gallery">${gallery}</section>
  <nav aria-label="Listing actions">${primary}</nav>
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
  const cards = page.cards
    .map(
      (card) =>
        `<article><h2><a href="${escapeHtml(card.path)}">${escapeHtml(card.title)}</a></h2><p>${escapeHtml(card.location)}</p></article>`,
    )
    .join("");
  return `
<main data-kind="search" data-total-matches="${escapeHtml(page.search.total_matches)}">
  <h1>${escapeHtml(page.metadata.title)}</h1>
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
<main data-kind="seller">
  <h1>${escapeHtml(page.body.h1)}</h1>
  <p>${escapeHtml(page.body.intro)}</p>
  <form method="post" action="${escapeHtml(page.body.valuation.endpoint)}" data-lead-type="seller">
    <input type="hidden" name="source" value="${escapeHtml(page.body.valuation.payload.source)}">
    <input type="hidden" name="leadType" value="${escapeHtml(page.body.valuation.payload.leadType)}">
    <input type="hidden" name="language" value="${escapeHtml(page.body.valuation.payload.language)}">
    <label>Name <input name="contact.name" required autocomplete="name"></label>
    <label>Property details <textarea name="message" required></textarea></label>
    <button type="submit">${escapeHtml(page.body.valuation.label)}</button>
  </form>
</main>`;
}

function renderContact(page) {
  return `
<main data-kind="contact">
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
  )}">
  <h1>Migration review</h1>
  <p><a href="${escapeHtml(page.launchReadinessEndpoint)}">Launch readiness JSON</a></p>
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
  )}" data-quality-affected-listings="${escapeHtml(
    page.listingQuality?.summary?.affected_listings || 0,
  )}">
    <h2>Listing quality queue</h2>
    <p><a href="${escapeHtml(page.listingQualityWorkbookEndpoint)}">Download listing quality workbook</a></p>
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
  const metrics = [
    ["Leads", page.summary.leads],
    ["Replies queued", page.summary.replies],
    ["Language requests", page.summary.languageRequests],
    ["Viewings", page.summary.viewings],
    ["Saved searches", page.summary.savedSearches],
    ["Seller pipeline", page.summary.sellerPipeline],
  ]
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  const leads = page.leads
    .map(
      (lead) => `
      <tr data-lead-row="true">
        <td><code>${escapeHtml(lead.lead_id)}</code></td>
        <td>${escapeHtml(lead.lead_type)}</td>
        <td>${escapeHtml(lead.source)}</td>
        <td>${escapeHtml(lead.original_language)} -> ${escapeHtml(lead.admin_locale)}</td>
        <td>${escapeHtml(lead.contact_preference)}</td>
        <td>
          <form method="post" action="/api/admin/replies">
            <input type="hidden" name="leadId" value="${escapeHtml(lead.lead_id)}">
            <input type="hidden" name="language" value="${escapeHtml(lead.original_language)}">
            <input type="hidden" name="approved" value="true">
            <label>Reviewer <input name="reviewer" required autocomplete="name"></label>
            <label>Reviewed reply <textarea name="reviewedReply" required></textarea></label>
            <button type="submit">Queue reply</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");
  const requests = page.languageRequests
    .map((request) => `<li>${escapeHtml(request.requested_locale)} -> ${escapeHtml(request.fallback_locale)}</li>`)
    .join("");
  return `
<main data-kind="admin-lead-inbox" data-admin-locale="${escapeHtml(page.workspace.locale)}" data-interface-locales="${escapeHtml(
    page.workspace.interface_locales.join(","),
  )}">
  <h1>${escapeHtml(page.workspace.modules.find((module) => module.id === "crm")?.primary_view || "Lead inbox")}</h1>
  <dl>${metrics}</dl>
  <section aria-label="CRM leads">
    <h2>CRM leads</h2>
    <table>
      <thead><tr><th>Lead</th><th>Type</th><th>Source</th><th>Language</th><th>Contact</th><th>Reply</th></tr></thead>
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
        `<li data-translation-locale="${escapeHtml(translation.locale)}">${escapeHtml(translation.locale)}: ${escapeHtml(
          translation.status,
        )}</li>`,
    )
    .join("");
  const staleTasks = page.translationTasks
    .filter((task) => task.status === "stale")
    .map((task) => `<li>${escapeHtml(task.target_locale || task.locale)} stale</li>`)
    .join("");
  return `
<main data-kind="admin-listing-editor" data-listing-id="${escapeHtml(page.listing.id)}" data-admin-locale="${escapeHtml(
    page.workspace.locale,
  )}">
  <h1>Property editor</h1>
  <p>${escapeHtml(page.listing.source_domain)} ${escapeHtml(page.listing.source_locale)}</p>
  <form method="post" action="/api/admin/listings/edit" data-editor-form="listing">
    <input type="hidden" name="listingId" value="${escapeHtml(page.listing.id)}">
    <label>Editor <input name="editor" required autocomplete="name"></label>
    ${fields}
    <button type="submit">Save source edit</button>
  </form>
  <section aria-label="Translation state">
    <h2>Translation state</h2>
    <ul>${translations}${staleTasks}</ul>
  </section>
  <section aria-label="Quality">
    <h2>Quality</h2>
    <dl>
      <dt>CMS status</dt><dd>${escapeHtml(page.listing.cms_status)}</dd>
      <dt>Schema</dt><dd>${escapeHtml(page.listing.seo?.schema_present ? "present" : "missing")}</dd>
      <dt>Media assets</dt><dd>${escapeHtml((page.listing.media || []).length)}</dd>
      <dt>Public tour</dt><dd>${escapeHtml(page.listing.tour?.available ? "available" : "review required")}</dd>
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
  if (page.kind === "language_fallback") return renderFallback(page);
  if (page.kind === "admin_migration_review") return renderAdminMigrationReview(page);
  if (page.kind === "admin_lead_inbox") return renderAdminLeadInbox(page);
  if (page.kind === "admin_listing_editor") return renderAdminListingEditor(page);
  return `<main data-kind="not-found"><h1>Not found</h1></main>`;
}

export function renderHtmlPage(page, options = {}) {
  return `<!doctype html>
<html lang="${escapeHtml(page.lang || page.locale || "en")}" dir="${escapeHtml(page.dir || "ltr")}">
<head>
${meta(page)}
</head>
<body>
${renderBody(page, options)}
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
