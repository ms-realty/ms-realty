function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
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

function renderFallback(page) {
  return `
<main data-kind="language-fallback">
  <h1>${escapeHtml(page.metadata.title)}</h1>
  <p>${escapeHtml(page.metadata.description)}</p>
  <a href="/api/language-requests" data-method="POST">Request this language</a>
</main>`;
}

function renderBody(page) {
  if (page.kind === "listing") return renderListing(page);
  if (page.kind === "search") return renderSearch(page);
  if (page.kind === "seller") return renderSeller(page);
  if (page.kind === "language_fallback") return renderFallback(page);
  return `<main data-kind="not-found"><h1>Not found</h1></main>`;
}

export function renderHtmlPage(page) {
  return `<!doctype html>
<html lang="${escapeHtml(page.lang || page.locale || "en")}" dir="${escapeHtml(page.dir || "ltr")}">
<head>
${meta(page)}
</head>
<body>
${renderBody(page)}
</body>
</html>`;
}

export function assertHtmlPage(html, { lang, dir, kind }) {
  if (!html.startsWith("<!doctype html>")) throw new Error("HTML response must be a document");
  if (!html.includes(`<html lang="${lang}" dir="${dir}">`)) throw new Error("HTML response must set lang and dir");
  if (!html.includes(`data-kind="${kind}"`)) throw new Error("HTML response must render the expected page kind");
  if (!html.includes("<link rel=\"canonical\"")) throw new Error("HTML response must include canonical metadata");
  return true;
}
