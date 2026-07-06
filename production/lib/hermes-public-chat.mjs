import { resolvePublicLocale } from "./locales.mjs";
import { searchRuntimeListings } from "./runtime.mjs";

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function requestedLocale(registry, input) {
  const code = String(input.locale || input.language || registry.source_locale || "bg").trim();
  if (!BCP47.test(code)) throw new Error("Chat locale must be a valid BCP 47 language code");
  return code;
}

function queryText(input) {
  const text = String(input.query || input.message || "").trim();
  if (!text) throw new Error("Chat query is required");
  if (text.length > 500) throw new Error("Chat query must be 500 characters or fewer");
  return text;
}

function disclosure({ available, cards }) {
  const fallbackCards = cards.filter((card) => !card.translation_indexable);
  if (!available || fallbackCards.length) {
    return "I answer only from approved MS Realty listing/CMS sources. Some results use approved fallback content because the requested page translation is not reviewed yet.";
  }
  return "I answer only from approved MS Realty listing/CMS sources.";
}

function answer(cards, totalMatches, note) {
  if (!cards.length) return `${note} I found no approved matching listings.`;
  const options = cards.map((card) => `${card.title} (${card.location}, ${card.path})`).join("; ");
  return `${note} I found ${totalMatches} approved matching listing${totalMatches === 1 ? "" : "s"}. First options: ${options}.`;
}

export function buildHermesPublicChat(registry, seed, input = {}, { translationTasks = [] } = {}) {
  const localeCode = requestedLocale(registry, input);
  const query = queryText(input);
  const resolved = resolvePublicLocale(registry, localeCode);
  const search = searchRuntimeListings(registry, seed, {
    localeCode,
    query,
    filters: input.filters || {},
    translationTasks,
  });
  const cards = search.cards.slice(0, 3);
  const note = disclosure({ available: resolved.available, cards });

  return {
    kind: "hermes_public_chat",
    mode: "retrieval_only",
    can_publish: false,
    can_send_customer_message: false,
    requested_locale: localeCode,
    response_locale: search.locale,
    lang: search.lang,
    dir: search.dir,
    fallback_used: !resolved.available || cards.some((card) => !card.translation_indexable),
    query,
    answer: answer(cards, search.search.total_matches, note),
    disclosure: note,
    citations: cards.map((card) => ({
      type: "listing",
      id: card.id,
      title: card.title,
      path: card.path,
      reviewed_translation: card.translation_indexable === true,
      translation_status: card.translation_status,
      translation_display: card.translation_display,
    })),
    suggested_actions: [
      { id: "search", label: "View search results", href: search.path },
      { id: "contact_broker", label: "Ask a broker", endpoint: "/api/leads", method: "POST" },
    ],
  };
}

export function assertHermesPublicChat(response) {
  if (response.kind !== "hermes_public_chat" || response.mode !== "retrieval_only") {
    throw new Error("Hermes public chat must be retrieval-only");
  }
  if (response.can_publish !== false || response.can_send_customer_message !== false) {
    throw new Error("Hermes public chat cannot publish or send customer messages");
  }
  if (!response.answer || !response.disclosure?.includes("approved MS Realty")) {
    throw new Error("Hermes public chat must disclose approved-source grounding");
  }
  for (const citation of response.citations || []) {
    if (citation.type !== "listing" || !citation.id || !citation.path?.startsWith(`/${response.response_locale}/`)) {
      throw new Error("Hermes public chat citations must point to locale-scoped listing pages");
    }
  }
  return true;
}
