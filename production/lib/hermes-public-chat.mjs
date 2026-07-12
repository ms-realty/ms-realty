import { approvedContentMatches, readApprovedCmsContent } from "./approved-content.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { searchRuntimeListings } from "./runtime.mjs";

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

const CHAT_COPY = {
  bg: {
    disclosure: "Отговарям само с одобрени източници на MS Realty.",
    fallback: "Отговарям само с одобрени източници на MS Realty. Част от резултатите използват одобрено резервно съдържание, защото преводът на заявения език още не е прегледан.",
    noResults: "Не намерих одобрени съвпадащи обяви.",
    found: (count) => `Намерих ${count} одобрени съвпадащи обяви.`,
    firstOptions: "Първи варианти:",
  },
  en: {
    disclosure: "I answer only from approved MS Realty listing and CMS sources.",
    fallback: "I answer only from approved MS Realty listing and CMS sources. Some results use approved fallback content because the requested page translation is not reviewed yet.",
    noResults: "I found no approved matching listings.",
    found: (count) => `I found ${count} approved matching listing${count === 1 ? "" : "s"}.`,
    firstOptions: "First options:",
  },
  de: {
    disclosure: "Ich antworte nur auf Grundlage genehmigter Quellen von MS Realty.",
    fallback: "Ich antworte nur auf Grundlage genehmigter Quellen von MS Realty. Einige Ergebnisse verwenden genehmigte Ersatzinhalte, weil die Übersetzung der angefragten Seite noch nicht geprüft ist.",
    noResults: "Ich habe keine passenden genehmigten Immobilien gefunden.",
    found: (count) => `Ich habe ${count} passende genehmigte Immobilien gefunden.`,
    firstOptions: "Erste Optionen:",
  },
  nl: {
    disclosure: "Ik antwoord alleen op basis van goedgekeurde bronnen van MS Realty.",
    fallback: "Ik antwoord alleen op basis van goedgekeurde bronnen van MS Realty. Sommige resultaten gebruiken goedgekeurde terugvalinhoud omdat de vertaling van de gevraagde pagina nog niet is beoordeeld.",
    noResults: "Ik heb geen passende goedgekeurde objecten gevonden.",
    found: (count) => `Ik heb ${count} passende goedgekeurde objecten gevonden.`,
    firstOptions: "Eerste opties:",
  },
  ru: {
    disclosure: "Я отвечаю только на основе одобренных источников MS Realty.",
    fallback: "Я отвечаю только на основе одобренных источников MS Realty. Часть результатов использует одобренный резервный контент, потому что перевод запрошенной страницы ещё не проверен.",
    noResults: "Подходящих одобренных объектов не найдено.",
    found: (count) => `Найдено одобренных подходящих объектов: ${count}.`,
    firstOptions: "Первые варианты:",
  },
  el: {
    disclosure: "Απαντώ μόνο από εγκεκριμένες πηγές της MS Realty.",
    fallback: "Απαντώ μόνο από εγκεκριμένες πηγές της MS Realty. Ορισμένα αποτελέσματα χρησιμοποιούν εγκεκριμένο εφεδρικό περιεχόμενο, επειδή η μετάφραση της ζητούμενης σελίδας δεν έχει ακόμη ελεγχθεί.",
    noResults: "Δεν βρήκα εγκεκριμένα ακίνητα που να ταιριάζουν.",
    found: (count) => `Βρήκα ${count} εγκεκριμένα ακίνητα που ταιριάζουν.`,
    firstOptions: "Πρώτες επιλογές:",
  },
  he: {
    disclosure: "אני עונה רק מתוך מקורות מאושרים של MS Realty.",
    fallback: "אני עונה רק מתוך מקורות מאושרים של MS Realty. חלק מהתוצאות משתמשות בתוכן חלופי מאושר, מפני שתרגום הדף המבוקש עדיין לא נבדק.",
    noResults: "לא נמצאו נכסים מאושרים תואמים.",
    found: (count) => `נמצאו ${count} נכסים מאושרים תואמים.`,
    firstOptions: "אפשרויות ראשונות:",
  },
};

function chatCopy(localeCode) {
  return CHAT_COPY[localeCode] || CHAT_COPY.en;
}

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

function disclosure({ available, cards, localeCode }) {
  const copy = chatCopy(localeCode);
  const fallbackCards = cards.filter((card) => !card.translation_indexable);
  return !available || fallbackCards.length ? copy.fallback : copy.disclosure;
}

function answer(cards, totalMatches, note, localeCode) {
  const copy = chatCopy(localeCode);
  if (!cards.length) return `${note} ${copy.noResults}`;
  const options = cards.map((card) => `${card.title} (${card.location}, ${card.path})`).join("; ");
  return `${note} ${copy.found(totalMatches)} ${copy.firstOptions} ${options}.`;
}

function contentAnswer(docs, note) {
  const facts = docs.flatMap((doc) => doc.facts.map((fact) => `${fact} [${doc.id}]`)).join(" ");
  return `${note} ${facts}`;
}

function contentCitations(docs) {
  return docs.map((doc) => ({
    type: "cms_page",
    id: doc.id,
    title: doc.title,
    path: doc.path,
    reviewed_translation: doc.status === "approved",
    translation_status: doc.status,
    translation_display: "approved_cms_source",
  }));
}

export function buildHermesPublicChat(
  registry,
  seed,
  input = {},
  { translationTasks = [], approvedContent = readApprovedCmsContent() } = {},
) {
  const localeCode = requestedLocale(registry, input);
  const query = queryText(input);
  const resolved = resolvePublicLocale(registry, localeCode);
  const cmsMatches = approvedContentMatches(approvedContent, query);
  const search = searchRuntimeListings(registry, seed, {
    localeCode,
    query,
    filters: input.filters || {},
    translationTasks,
  });
  const cards = search.cards.slice(0, 3);
  const contentFallback = cmsMatches.some((doc) => doc.locale !== resolved.locale.code);
  const note = disclosure({ available: resolved.available && !contentFallback, cards, localeCode: resolved.locale.code });
  const citations = cmsMatches.length
    ? contentCitations(cmsMatches)
    : cards.map((card) => ({
        type: "listing",
        id: card.id,
        title: card.title,
        path: card.path,
        reviewed_translation: card.translation_indexable === true,
        translation_status: card.translation_status,
        translation_display: card.translation_display,
      }));

  return {
    kind: "hermes_public_chat",
    mode: "retrieval_only",
    can_publish: false,
    can_send_customer_message: false,
    requested_locale: localeCode,
    response_locale: search.locale,
    lang: search.lang,
    dir: search.dir,
    fallback_used: !resolved.available || contentFallback || cards.some((card) => !card.translation_indexable),
    source_policy: "approved_ms_realty_only",
    query,
    answer: cmsMatches.length ? contentAnswer(cmsMatches, note) : answer(cards, search.search.total_matches, note, resolved.locale.code),
    disclosure: note,
    citations,
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
  if (!response.answer || !response.disclosure || response.source_policy !== "approved_ms_realty_only") {
    throw new Error("Hermes public chat must disclose approved-source grounding");
  }
  for (const citation of response.citations || []) {
    if (
      !["listing", "cms_page"].includes(citation.type) ||
      !citation.id ||
      typeof citation.path !== "string" ||
      !/^\/(?![\/\\])/.test(citation.path)
    ) {
      throw new Error("Hermes public chat citations must point to approved listing or CMS sources");
    }
  }
  return true;
}
