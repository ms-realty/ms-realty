import React from "react";

const h = React.createElement;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attributeName(name) {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  if (name === "defaultValue") return "value";
  if (name === "autoComplete") return "autocomplete";
  return name;
}

function renderAttributes(props = {}) {
  const attributes = Object.entries(props)
    .filter(([name, value]) => name !== "children" && name !== "dangerouslySetInnerHTML" && name !== "key" && value !== false && value !== null && value !== undefined)
    .filter(([name]) => !name.startsWith("on"))
    .map(([name, value]) => {
      const htmlName = attributeName(name);
      if (value === true) return htmlName;
      return `${htmlName}="${escapeHtml(value)}"`;
    });
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

function renderChildren(children) {
  return React.Children.toArray(children).map((child) => renderStaticElement(child)).join("");
}

function renderStaticElement(element) {
  if (element === null || element === undefined || element === false || element === true) return "";
  if (typeof element === "string" || typeof element === "number") return escapeHtml(element);
  if (Array.isArray(element)) return element.map((child) => renderStaticElement(child)).join("");
  if (!React.isValidElement(element)) return "";
  if (element.type === React.Fragment) return renderChildren(element.props.children);
  if (typeof element.type === "function") return renderStaticElement(element.type(element.props));
  if (typeof element.type !== "string") return "";

  const attributes = renderAttributes(element.props);
  if (VOID_TAGS.has(element.type)) return `<${element.type}${attributes}>`;
  return `<${element.type}${attributes}>${renderChildren(element.props.children)}</${element.type}>`;
}

function price(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `EUR ${amount.toLocaleString("en-US")}` : "Price on request";
}

function cardSummary(card) {
  return [card.location, card.property_type, card.offer_type].filter(Boolean).join(" / ");
}

function SearchCard({ card }) {
  return h(
    "article",
    {
      "data-search-card": "true",
      "data-listing-id": card.id,
      "data-translation-display": card.translation_display,
      "data-review-badge": card.review_badge,
      "data-listing-status": card.listing_status,
    },
    h("p", { "data-card-badge": "true" }, (card.review_badge || "").replaceAll("_", " ")),
    h("h2", null, h("a", { href: card.path }, card.title)),
    h("p", { "data-card-price": "true" }, price(card.price_eur)),
    h("p", { "data-search-card-meta": "true" }, cardSummary(card)),
    h("p", { "data-card-media-count": card.image_count }, `${card.image_count || 0} photos`),
    h(
      "nav",
      { "aria-label": "Search result actions" },
      h("a", { href: card.actions.detail.href }, card.actions.detail.label),
      h(
        "button",
        {
          type: "button",
          "data-endpoint": card.actions.inquiry.endpoint,
          "data-listing-reference": card.actions.inquiry.payload.listingReference,
        },
        card.actions.inquiry.label,
      ),
      h("button", { type: "button", "data-client-save-listing": card.actions.save.listing_id }, card.actions.save.label),
    ),
  );
}

function HomeBody({ page }) {
  return h(
    "main",
    { "data-kind": "home", "data-react-public-ui": "home" },
    h("h1", null, page.body.h1),
    h("p", null, page.body.intro),
    h(
      "form",
      { action: page.body.search.path, method: "get", role: "search" },
      h("label", null, "Search ", h("input", { name: "q", type: "search", autoComplete: "off" })),
      h("button", { type: "submit" }, "Search"),
    ),
    h(
      "nav",
      { "aria-label": "Primary actions" },
      h("a", { href: page.body.seller.path, "data-action": "seller" }, page.body.seller.label),
      h("a", { href: page.body.contact.path, "data-action": "contact" }, page.body.contact.label),
    ),
    h(
      "section",
      { "aria-label": "Featured listings" },
      ...(page.cards || []).map((card) => h(SearchCard, { key: card.id, card })),
    ),
  );
}

function SearchBody({ page }) {
  const controls = page.search.controls || {};
  const filter = (name, label) =>
    h("label", { key: name }, `${label} `, h("input", { name, defaultValue: page.search.filters?.[name] || "" }));
  return h(
    "main",
    {
      "data-kind": "search",
      "data-react-public-ui": "search",
      "data-total-matches": page.search.total_matches,
      "data-list-first-mobile": page.mobile_policy?.list_first_mobile ? "true" : "false",
      "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false",
      "data-min-touch-target": page.mobile_policy?.minimum_tap_target_px || 44,
    },
    h("h1", null, page.metadata.title),
    h(
      "form",
      { action: page.path, method: "get", role: "search" },
      h("label", null, "Search ", h("input", { name: "q", type: "search", defaultValue: page.search.query || "", autoComplete: "off" })),
      filter("location", "Location"),
      filter("property_type", "Type"),
      h(
        "fieldset",
        { "data-view-mode-control": "true", "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false" },
        h("legend", null, "View"),
        ...(controls.view_modes || []).map((mode) =>
          h("button", { key: mode.id, type: "submit", name: "view", value: mode.id, "aria-pressed": mode.default ? "true" : "false", "data-view-mode": mode.id }, mode.label),
        ),
      ),
      h("button", { type: "submit" }, "Search"),
    ),
    h(
      "form",
      { method: controls.save_search?.method || "POST", action: controls.save_search?.endpoint || "/api/saved-searches", "data-save-search-endpoint": controls.save_search?.endpoint || "/api/saved-searches" },
      h("input", { type: "hidden", name: "language", defaultValue: page.locale }),
      h("input", { type: "hidden", name: "query", defaultValue: page.search.query || "" }),
      h("button", { type: "submit" }, "Save search"),
    ),
    h("p", null, `${page.search.total_matches} matches`),
    h("section", { "aria-label": "Search results" }, ...(page.cards || []).map((card) => h(SearchCard, { key: card.id, card }))),
  );
}

function ListingBody({ page }) {
  const facts = page.body.facts || {};
  const tour = page.body.media.tour || {};
  const channels = page.body.actions.direct_contact.channels || [];
  return h(
    "main",
    {
      "data-kind": "listing",
      "data-react-public-ui": "listing",
      "data-review-status": page.body.actions.direct_contact.review_status,
      "data-listing-status": page.body.lifecycle?.status || "available",
      "data-active-in-search": page.body.lifecycle?.active_in_search ? "true" : "false",
      "data-min-touch-target": "44",
    },
    h(
      "section",
      { "aria-label": "Listing summary", "data-listing-summary": "true", "data-source-domain": page.body.source.source_domain, "data-schema-ready": page.schema ? "true" : "false" },
      h("p", { "data-listing-verification": "true" }, page.translation.human_approved ? "reviewed translation" : "approved source"),
      h("h1", null, page.body.h1),
      h("p", { "data-listing-price": "true" }, facts.price_on_request ? "Price on request" : price(facts.price_eur)),
      h(
        "ul",
        { "data-listing-highlights": "true" },
        ...["location", "property_type", "offer_type", "bedrooms"].filter((key) => facts[key]).map((key) => h("li", { key }, `${key}: ${facts[key]}`)),
      ),
    ),
    h("p", null, page.body.description || ""),
    h(
      "section",
      { id: "listing-gallery", "aria-label": "Gallery", "data-photo-carousel": "true" },
      ...(page.body.media.gallery || []).slice(0, 12).map((image) => h("img", { key: image.url, src: image.url, alt: image.alt || page.body.h1, loading: "lazy" })),
    ),
    h(
      "section",
      {
        id: "listing-tour",
        "aria-label": "360 tour",
        "data-photo-sphere-viewer": tour.available ? tour.mount_target : "review_required",
        "data-tour-provider": tour.provider || "photo-sphere-viewer",
      },
      h("p", null, tour.available ? tour.accessibility_caption : tour.review_status || "review required"),
    ),
    h(
      "nav",
      { "aria-label": "Listing actions", "data-mobile-sticky-actions": page.body.actions.sticky_mobile ? "true" : "false" },
      ...(page.body.actions.primary || []).map((action) => h("button", { key: action.id, type: "button", "data-endpoint": action.endpoint }, action.label)),
    ),
    h(
      "nav",
      { "aria-label": "Save and share" },
      ...(page.body.actions.secondary || []).map((action) =>
        action.kind === "share" || action.kind === "print"
          ? h("a", { key: action.id, href: action.url, "data-listing-action": action.id }, action.label)
          : h("button", { key: action.id, type: "button", "data-listing-action": action.id, "data-client-save-listing": action.listing_id }, action.label),
      ),
    ),
    h(
      "nav",
      { "aria-label": "Broker contact" },
      ...channels.map((channel) =>
        channel.enabled
          ? h("a", { key: channel.label, href: channel.href }, channel.label)
          : h("span", { key: channel.label, "aria-disabled": "true" }, channel.label),
      ),
    ),
  );
}

export function renderReactPublicBody(page) {
  if (page.kind === "home") return renderStaticElement(h(HomeBody, { page }));
  if (page.kind === "search") return renderStaticElement(h(SearchBody, { page }));
  if (page.kind === "listing") return renderStaticElement(h(ListingBody, { page }));
  return "";
}
