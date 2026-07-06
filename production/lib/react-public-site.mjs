import { h, renderStaticElement } from "./react-static-html.mjs";

function price(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `EUR ${amount.toLocaleString("en-US")}` : "Price on request";
}

function cardSummary(card) {
  return [card.location, card.property_type, card.offer_type].filter(Boolean).join(" / ");
}

function factsList(facts = {}) {
  return h(
    "dl",
    null,
    ...Object.entries(facts)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .flatMap(([key, value]) => [h("dt", { key: `${key}-term` }, key.replaceAll("_", " ")), h("dd", { key: `${key}-value` }, value)]),
  );
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
      "nav",
      { "aria-label": "Locations" },
      ...(page.body.locations || []).map((location) => h("a", { key: location.path, href: location.path }, location.location)),
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
        "label",
        null,
        "Sort ",
        h(
          "select",
          { name: "sort" },
          ...(controls.sort_options || []).map((option) => h("option", { key: option.id, value: option.id, selected: option.default ? true : undefined }, option.label)),
        ),
      ),
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
    h(
      "section",
      { "aria-label": "Active filters", "data-active-filter-count": (controls.active_filter_chips || []).length },
      ...(controls.active_filter_chips || []).map((chip) => h("span", { key: chip.key, "data-filter-chip": chip.key }, chip.value)),
    ),
    h("p", null, `${page.search.total_matches} matches`),
    h("section", { "aria-label": "Search results" }, ...(page.cards || []).map((card) => h(SearchCard, { key: card.id, card }))),
  );
}

function LocationBody({ page }) {
  return h(
    "main",
    {
      "data-kind": "location",
      "data-react-public-ui": "location",
      "data-location": page.body.location,
      "data-total-matches": page.body.listing_count,
      "data-list-first-mobile": "true",
    },
    h("h1", null, page.body.h1),
    h("p", null, `${page.body.listing_count} reviewed listings`),
    h("section", { "aria-label": "Location listings" }, ...(page.cards || []).map((card) => h(SearchCard, { key: card.id, card }))),
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
    factsList(facts),
    h(
      "nav",
      {
        "aria-label": "Listing media",
        "data-media-gallery-count": page.body.media.gallery_count || 0,
        "data-tour-status": tour.available ? "available" : tour.review_status || "review_required",
      },
      h("a", { href: "#listing-gallery" }, "Photos"),
      h("a", { href: "#listing-tour", "aria-disabled": tour.available ? "false" : "true" }, "360"),
    ),
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
      "section",
      { "aria-label": "Related listings" },
      ...(page.body.related_listings || []).map((card) =>
        h("article", { key: card.id, "data-related-listing": "true" }, h("h2", null, h("a", { href: card.path }, card.title))),
      ),
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

function SellerBody({ page }) {
  const valuation = page.body.valuation;
  return h(
    "main",
    {
      "data-kind": "seller",
      "data-react-public-ui": "seller",
      "data-phone-first": "true",
      "data-no-public-avm": "true",
      "data-broker-review-required": "true",
      "data-min-touch-target": "44",
    },
    h(
      "section",
      { "aria-label": "Seller valuation", "data-seller-valuation-flow": "broker_callback" },
      h("h1", null, page.body.h1),
      h("p", null, page.body.intro),
      h(
        "ol",
        { "data-seller-steps": "true" },
        h("li", null, "Property details"),
        h("li", null, "Broker review"),
        h("li", null, "Callback"),
      ),
    ),
    h(
      "form",
      { method: valuation.method || "POST", action: valuation.endpoint, "data-lead-type": "seller" },
      h("input", { type: "hidden", name: "source", defaultValue: valuation.payload.source }),
      h("input", { type: "hidden", name: "leadType", defaultValue: valuation.payload.leadType }),
      h("input", { type: "hidden", name: "language", defaultValue: valuation.payload.language }),
      h("label", null, "Name ", h("input", { name: "contact.name", required: true, autoComplete: "name" })),
      h("label", null, "Phone ", h("input", { name: "contact.phone", required: true, autoComplete: "tel", inputMode: "tel" })),
      h(
        "label",
        null,
        "Preferred contact ",
        h(
          "select",
          { name: "contact_preference" },
          h("option", { value: "phone" }, "Phone"),
          h("option", { value: "whatsapp" }, "WhatsApp"),
          h("option", { value: "viber" }, "Viber"),
        ),
      ),
      h("label", null, "Location ", h("input", { name: "property.location", autoComplete: "address-level2" })),
      h("label", null, "Property type ", h("input", { name: "property.type" })),
      h("label", null, "Property details ", h("textarea", { name: "message", required: true })),
      h("button", { type: "submit" }, valuation.label),
    ),
  );
}

function ContactBody({ page }) {
  const callback = page.body.callback;
  return h(
    "main",
    { "data-kind": "contact", "data-react-public-ui": "contact", "data-phone-first": "true", "data-min-touch-target": "44" },
    h("h1", null, page.body.h1),
    h("p", null, page.body.intro),
    h(
      "form",
      {
        method: callback.method || "POST",
        action: callback.endpoint,
        "data-lead-type": "general",
        "data-source": callback.payload.source,
      },
      h("input", { type: "hidden", name: "source", defaultValue: callback.payload.source }),
      h("input", { type: "hidden", name: "leadType", defaultValue: callback.payload.leadType }),
      h("input", { type: "hidden", name: "language", defaultValue: callback.payload.language }),
      h("input", { type: "hidden", name: "contact_preference", defaultValue: callback.payload.contact_preference }),
      h("label", null, "Name ", h("input", { name: "contact.name", required: true, autoComplete: "name" })),
      h("label", null, "Message ", h("textarea", { name: "message", required: true })),
      h("button", { type: "submit" }, callback.label),
    ),
    h(
      "nav",
      { "aria-label": "Contact actions" },
      h("a", { href: page.body.search.path, "data-action": "search" }, "Search"),
      h("a", { href: page.body.seller.path, "data-action": "seller" }, "Seller valuation"),
    ),
  );
}

function LanguageFallbackBody({ page }) {
  return h(
    "main",
    {
      "data-kind": "language-fallback",
      "data-react-public-ui": "language-fallback",
      "data-hermes-chat-available": page.hermes_chat_available ? "true" : "false",
      "data-public-translation-available": page.public_translation_available ? "true" : "false",
    },
    h("h1", null, page.metadata.title),
    h("p", null, page.metadata.description),
    h(
      "form",
      { method: "POST", action: "/api/language-requests", "data-request-language": "true" },
      h("input", { type: "hidden", name: "requested_locale", defaultValue: page.requested_locale }),
      h("input", { type: "hidden", name: "fallback_locale", defaultValue: page.locale }),
      h("button", { type: "submit" }, "Request this language"),
    ),
    h("a", { href: "/api/hermes/chat", "data-action": "ask-hermes" }, "Ask in this language"),
  );
}

export function renderReactPublicBody(page) {
  if (page.kind === "home") return renderStaticElement(h(HomeBody, { page }));
  if (page.kind === "search") return renderStaticElement(h(SearchBody, { page }));
  if (page.kind === "listing") return renderStaticElement(h(ListingBody, { page }));
  if (page.kind === "location") return renderStaticElement(h(LocationBody, { page }));
  if (page.kind === "seller") return renderStaticElement(h(SellerBody, { page }));
  if (page.kind === "contact") return renderStaticElement(h(ContactBody, { page }));
  if (page.kind === "language_fallback") return renderStaticElement(h(LanguageFallbackBody, { page }));
  return "";
}
