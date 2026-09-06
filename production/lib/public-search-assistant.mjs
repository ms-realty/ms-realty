import { normalizeSearchRequest, parseNaturalLanguageSearchIntent, naturalLanguageSearchCandidates, mergeSearchInputs, SEARCH_INTENT_INPUT_FIELDS } from "./search-request.mjs";
import { normalizeSearchIntent } from "./search-intent.mjs";
import { currentApprovedListingSource } from "./public-listing-questions.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
import { propertyFamilyFor } from "./listing-facts.mjs";
import { publishedListingTranslationCopy } from "./content.mjs";
import { contentHash } from "./translations.mjs";
import { searchPath, listingPath } from "./seo.mjs";

export const PUBLIC_SEARCH_ASSISTANT_PATHS = Object.freeze(["/api/search/interpret", "/api/listings/match", "/api/search/alternatives"]);
export const PUBLIC_SEARCH_ASSISTANT_MAX_BYTES = 8192;
const MESSAGES = {
  en: ["Review your choices before applying them. Unconfirmed wishes stay with your search.", "Check your search words, language and filter values.", "The approved listing source could not be checked. Keep your search and try again."],
  bg: ["Прегледайте избора си, преди да го приложите. Непотвърдените желания остават към търсенето.", "Проверете текста, езика и стойностите на филтрите.", "Одобреният източник на обявата не може да бъде проверен. Запазете търсенето и опитайте отново."],
  ru: ["Проверьте выбранные условия перед применением. Неподтверждённые пожелания сохраняются в поиске.", "Проверьте текст, язык и значения фильтров.", "Не удалось проверить одобренный источник объявления. Сохраните поиск и попробуйте снова."],
  de: ["Prüfen Sie Ihre Auswahl vor dem Anwenden. Unbestätigte Wünsche bleiben bei Ihrer Suche.", "Prüfen Sie Suchtext, Sprache und Filterwerte.", "Die freigegebene Quelle des Angebots konnte nicht geprüft werden. Behalten Sie Ihre Suche und versuchen Sie es erneut."],
  nl: ["Controleer uw keuzes voordat u ze toepast. Onbevestigde wensen blijven bij uw zoekopdracht.", "Controleer de zoektekst, taal en filterwaarden.", "De goedgekeurde bron van de advertentie kon niet worden gecontroleerd. Bewaar uw zoekopdracht en probeer het opnieuw."],
  el: ["Ελέγξτε τις επιλογές σας πριν τις εφαρμόσετε. Οι ανεπιβεβαίωτες προτιμήσεις παραμένουν στην αναζήτηση.", "Ελέγξτε το κείμενο, τη γλώσσα και τις τιμές των φίλτρων.", "Δεν ήταν δυνατός ο έλεγχος της εγκεκριμένης πηγής της αγγελίας. Κρατήστε την αναζήτησή σας και δοκιμάστε ξανά."],
  he: ["בדקו את הבחירות לפני החלתן. העדפות שלא אושרו נשמרות עם החיפוש.", "בדקו את מילות החיפוש, השפה וערכי המסננים.", "לא ניתן לבדוק את המקור המאושר של המודעה. שמרו את החיפוש ונסו שוב."],
};
const message = (locale, index = 0) => (MESSAGES[locale] || MESSAGES.en)[index];
const present = (value) => value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fold = (value) => String(value).normalize("NFKC").toLocaleLowerCase().trim();
const fail = (code, locale, fields = [], status = 400) => Object.assign(new Error(message(locale, status === 400 ? 1 : 2)), { code, status, fields });

function validateInput(registry, input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !fields.includes(key))) throw fail("invalid_search_assistant_input", input?.locale);
  if (!registry.locales.some((row) => row.code === input.locale && row.public_enabled && row.indexable)) throw fail("invalid_search_locale", input.locale);
}
function criteriaRequest(input, locale) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("invalid_search_criteria", locale);
  try {
    const request = normalizeSearchRequest(Object.hasOwn(input, "mandatory_filters") ? { search_intent: input, locale } : { ...input, locale }, { defaultLocale: locale });
    if (request.intent.text_query.length > 240) throw fail("search_text_too_long", locale, ["text_query"]);
    return request;
  } catch (error) {
    throw fail("invalid_search_criteria", locale, error.fields || []);
  }
}
function searchUrl(registry, intent, originalQuery) {
  // Keep the full canonical intent; scalar query filters lose multi-selects.
  const serializable = { ...intent, map_bounds: intent.map_bounds ? Object.values(intent.map_bounds) : null };
  const params = new URLSearchParams({ search_intent: JSON.stringify(serializable) });
  if (originalQuery) params.set("nl_context", originalQuery);
  return `${searchPath(registry, intent.locale)}?${params}`;
}
function responseBase(kind, locale, request) {
  return { kind, locale, message: message(locale), original_query: request?.natural_language?.original_query || "", criteria: request?.intent || null, criteria_hash: request ? contentHash(request.intent) : null, applied: false, requires_confirmation: true };
}
function residualWords(text, candidates) {
  // RegExp offsets are UTF-16 positions, so retain that indexing here.
  const masked = text.split("");
  for (const row of candidates) for (let i = row.start; i < row.end; i++) masked[i] = " ";
  return masked.join("").split(/[,;.!?]+/u).map((value) => value.trim())
    .map((value) => value.replace(/^(?:(?:in|a|an|the|and|with|for|в|с|и|на|за)\s+)+/iu, "").replace(/\s+(?:in|a|an|the|and|with|for|в|с|и|на|за)$/iu, "").trim())
    .filter((value) => /[\p{L}\p{N}]/u.test(value));
}

export function interpretPublicSearch({ registry, input }) {
  validateInput(registry, input, ["locale", "text", "current"]);
  if (typeof input.text !== "string" || !input.text.trim() || input.text.trim().length > 240 || /[\u0000-\u001F]/u.test(input.text)) throw fail("invalid_search_text", input.locale, ["text"]);
  const text = input.text.trim();
  const current = criteriaRequest(input.current || {}, input.locale);
  const base = { ...responseBase("search_interpretation", input.locale, current), original_query: text, mode: null, proposed_intent: null, proposed_url: null, inferred: [], unresolved: [], ambiguities: [] };
  let parsed, candidates;
  try {
    parsed = parseNaturalLanguageSearchIntent(text, { defaultLocale: input.locale });
    candidates = naturalLanguageSearchCandidates(text);
  } catch (error) {
    return { ...base, status: "needs_clarification", code: "interpretation_unavailable", fields: error.fields || [], unresolved: [{ text, reason: "not_interpreted" }] };
  }
  const fields = [...new Set(candidates.map((row) => row.field))];
  const ambiguities = fields.flatMap((field) => {
    const options = [...new Map(candidates.filter((row) => row.field === field).map((row) => [JSON.stringify(row.value), row.value])).values()];
    return options.length > 1 ? [{ field, reason: "multiple_values", options }] : [];
  });
  // The small parser does not understand negation, non-EUR amounts or units.
  // Refuse those inferred comparisons instead of treating a nearby number as a price.
  const semanticRisk = /\b(?:not|except|without|excluding|no|usd|gbp|dollars?|pounds?|sqm|m2|m²)\b|(?:без|освен|не |кв\.?\s*м|m[²2]|лв|лева|руб|\$|£)|\d[.,]\d{1,2}(?![\d\w])/iu.test(text);
  const inferredIntent = { ...parsed.intent };
  if (semanticRisk) {
    for (const row of candidates) inferredIntent[row.field] = Array.isArray(row.value) ? [] : null;
    ambiguities.push({ field: "text", reason: "unsupported_relation_or_unit", options: [] });
  }
  for (const row of ambiguities) if (Object.hasOwn(inferredIntent, row.field)) inferredIntent[row.field] = Array.isArray(inferredIntent[row.field]) ? [] : null;
  // Explicit current filters win, including cleared values and equivalent aliases.
  const rawCurrent = input.current || {};
  const object = (value) => typeof value === "string" ? JSON.parse(value) : value || {};
  const selected = object(rawCurrent.search_intent ?? rawCurrent.intent);
  const currentFields = Object.fromEntries(Object.entries(rawCurrent).filter(([key]) => SEARCH_INTENT_INPUT_FIELDS.includes(key)));
  let proposed;
  try {
    proposed = normalizeSearchRequest({ filters: mergeSearchInputs(Object.fromEntries(Object.entries(inferredIntent).filter(([key]) => key !== "mandatory_filters")), object(rawCurrent.filters), Object.fromEntries(Object.entries(selected).filter(([key]) => key !== "mandatory_filters")), currentFields), locale: input.locale, nl_context: text }, { defaultLocale: input.locale });
  } catch (error) {
    return { ...base, status: "needs_clarification", code: "invalid_interpreted_range", fields: error.fields || [], unresolved: [{ text, reason: "not_interpreted" }] };
  }
  const inferred = candidates.map((row) => ({ ...row, included: !semanticRisk && !ambiguities.some((issue) => issue.field === row.field) && equal(proposed.intent[row.field], row.value), proposed_value: proposed.intent[row.field] }));
  const unresolved = (semanticRisk ? [text] : residualWords(text, candidates.filter((row) => inferred.some((item) => item.start === row.start && item.included))))
    .map((text) => ({ text, reason: "not_applied_as_filter" }));
  return { ...base, status: ambiguities.length ? "needs_clarification" : unresolved.length ? "review_with_unresolved" : "ready_for_review", code: ambiguities.length ? "ambiguous_search" : parsed.mode === "lexical_fallback" ? "lexical_fallback" : "review_required", mode: parsed.mode, inferred, unresolved, ambiguities,
    proposed_intent: proposed.intent, proposed_url: ambiguities.length ? null : searchUrl(registry, proposed.intent, text) };
}

const NUMERIC = {
  price_min: ["price_eur", "min"], price_max: ["price_eur", "max"],
  bedrooms_min: ["bedrooms", "min"], bedrooms_max: ["bedrooms", "max"],
  primary_area_min: ["area_sqm", "min"], primary_area_max: ["area_sqm", "max"],
  land_area_min: ["land_area_sqm", "min"], land_area_max: ["land_area_sqm", "max"],
  floor_min: ["floor", "min"], floor_max: ["floor", "max"],
  storeys_min: ["storeys_count", "min"], storeys_max: ["storeys_count", "max"],
  premises_min: ["premises_count", "min"], hotel_rooms_min: ["hotel_room_count", "min"],
};
const SCALARS = { offer_type: "offer_type", listing_status: "listing_status", country_code: "country_code", municipality: "municipality", district: "district" };
const ARRAYS = { property_subtypes: "property_subtype", parking_kinds: "parking_kind", construction_statuses: "construction_status" };
const SKIP = new Set(["schema_version", "locale", "sort", "page", "page_size", "mandatory_filters", "price_currency"]);

function sourceFor({ registry, record, locale, now }) {
  const checked = currentApprovedListingSource(record, locale, now);
  if (!checked) return null;
  return { listing_id: record.id, locale, canonical_url: listingPath(registry, locale, record.id), source_hash: checked.source_hash, reviewer: checked.reviewer, reviewed_at: checked.reviewed_at };
}
function compareFacts(record, intent, source) {
  const facts = record.facts;
  const comparisons = intent.price_currency !== "EUR" ? [{ field: "price_currency", requested: intent.price_currency, status: "unsupported", reason: "currency_conversion_unavailable", evidence: null }] : [];
  for (const [field, requested] of Object.entries(intent)) {
    if (SKIP.has(field) || !present(requested)) continue;
    let value = null, sourceField = null, matched = false, reason = "source_fact_missing";
    if (NUMERIC[field]) {
      const [key, operator] = NUMERIC[field]; sourceField = key; value = facts[key] ?? null;
      if (key === "price_eur" && (facts.price_on_request === true || intent.price_currency !== "EUR")) value = null;
      if (present(value) && Number.isFinite(Number(value))) matched = operator === "min" ? Number(value) >= requested : Number(value) <= requested;
      else value = null;
    } else if (SCALARS[field] || ARRAYS[field]) {
      sourceField = SCALARS[field] || ARRAYS[field]; value = facts[sourceField] ?? null;
      matched = (Array.isArray(requested) ? requested : [requested]).some((expected) => fold(expected) === fold(value));
    } else if (field === "property_families") {
      sourceField = "property_type"; value = facts.property_type ?? null;
      matched = requested.includes(propertyFamilyFor(facts));
    } else if (field === "location_ids") {
      sourceField = "location"; value = facts.location ?? null;
      matched = requested.some((expected) => fold(value).includes(fold(expected)));
      reason = "stated_area_only";
    } else if (field === "exact_reference") {
      sourceField = "id"; value = record.id; matched = fold(value) === fold(requested);
    } else if (["geography_id", "region_id"].includes(field)) {
      sourceField = "geography_path"; value = facts.geography_path ?? null; matched = Array.isArray(value) && value.includes(requested);
    } else if (field === "text_query") {
      sourceField = "approved_copy";
      const copy = publishedListingTranslationCopy(record.translations.find((row) => row.locale === intent.locale));
      value = copy ? { title: copy.title, description: copy.description } : null;
      matched = value && requested.split(/\s+/u).every((word) => fold(`${copy.title} ${copy.description}`).includes(fold(word)));
      reason = "literal_words_only";
    } else {
      comparisons.push({ field, requested, status: "unsupported", reason: "comparison_unavailable", evidence: null });
      continue;
    }
    comparisons.push({ field, requested, status: !present(value) ? "unknown" : matched ? "matched" : "not_matched", reason: !present(value) ? "source_fact_missing" : reason === "source_fact_missing" ? "recorded_value" : reason,
      evidence: present(value) ? { ...source, field: sourceField, value } : null });
  }
  return comparisons;
}
export function explainPublicListingMatch({ registry, seed, input, now = new Date().toISOString() }) {
  validateInput(registry, input, ["locale", "listingId", "criteria", "sourceHash"]);
  if (typeof input.listingId !== "string" || !/^MS-[A-Z0-9-]{1,70}$/u.test(input.listingId) || (input.sourceHash !== undefined && !/^[a-f0-9]{64}$/u.test(input.sourceHash))) throw fail("invalid_listing_reference", input.locale);
  const request = criteriaRequest(input.criteria, input.locale);
  const base = { ...responseBase("listing_match_explanation", input.locale, request), listing_id: input.listingId, comparison_method: "structured_filters_and_literal_words", comparisons: [], source: null, suitability_score: null };
  const record = publicSeedFor(seed, { now }).records.find((row) => row.collection === "listings" && row.id === input.listingId);
  if (!record) throw fail("listing_unavailable", input.locale, [], 404);
  const source = sourceFor({ registry, seed, record, locale: input.locale, now });
  if (!source) return { ...base, status: "unavailable", code: "approved_source_unavailable", message: message(input.locale, 2) };
  if (input.sourceHash && input.sourceHash !== source.source_hash) return { ...base, status: "source_changed", code: "source_changed", source, message: message(input.locale, 2) };
  const comparisons = compareFacts(record, request.intent, source);
  const unknown = comparisons.some((row) => ["unknown", "unsupported"].includes(row.status));
  const unresolved = base.original_query ? [{ text: base.original_query, reason: "unconfirmed_wishes_retained" }] : [];
  return { ...base, status: !comparisons.length ? "no_criteria" : comparisons.some((row) => row.status === "not_matched") ? "differs" : unknown ? "incomplete" : "recorded_filters_match", code: "comparison_ready", comparisons, unresolved, source, requires_confirmation: false };
}

const CHANGE_FIELDS = new Set([...Object.keys(NUMERIC), "location_ids", "property_families"]);
export function suggestPublicSearchAlternatives({ registry, seed, input, now = new Date().toISOString() }) {
  validateInput(registry, input, ["locale", "criteria", "change"]);
  const request = criteriaRequest(input.criteria, input.locale);
  const base = { ...responseBase("search_alternatives", input.locale, request), count_scope: "current_human_approved_source_records", result_count: null, alternatives: [], checked_at: now };
  const sources = publicSeedFor(seed, { now }).records.filter((row) => row.collection === "listings").flatMap((record) => {
    const source = sourceFor({ registry, seed, record, locale: input.locale, now });
    return source ? [{ record, source }] : [];
  });
  const matches = (intent) => sources.filter(({ record, source }) => compareFacts(record, intent, source).every((row) => row.status === "matched"));
  const originalCount = matches(request.intent).length;
  const alternative = (field, value) => {
    const before = request.intent[field];
    if (equal(before, value)) return null;
    const intent = normalizeSearchIntent({ ...request.intent, map_bounds: request.intent.map_bounds ? Object.values(request.intent.map_bounds) : null, [field]: value }, { defaultLocale: input.locale });
    if (equal(before, intent[field])) return null;
    const results = matches(intent);
    return { change: { field, before, after: intent[field] }, proposed_intent: intent, proposed_url: searchUrl(registry, intent, base.original_query), matching_reviewed_listings: sources.length ? results.length : null, source_examples: results.slice(0, 3).map(({ source }) => source), requires_confirmation: true, applied: false };
  };
  if (input.change !== undefined) {
    const change = input.change;
    if (!change || typeof change !== "object" || Array.isArray(change) || Object.keys(change).some((key) => !["field", "value"].includes(key)) || !Object.hasOwn(change, "value") || !CHANGE_FIELDS.has(change.field)) throw fail("choose_one_search_change", input.locale, ["change"]);
    if (change.field.startsWith("price_") && (!present(change.value) || !Number.isFinite(Number(change.value)) || Number(change.value) <= 0)) throw fail("invalid_alternative_budget", input.locale, [change.field]);
    let preview;
    try { preview = alternative(change.field, change.value); } catch (error) { throw fail("invalid_alternative_criteria", input.locale, error.fields || [change.field]); }
    if (!preview) throw fail("search_change_required", input.locale, [change.field]);
    return { ...base, status: sources.length ? "preview" : "unavailable", code: sources.length ? "review_one_change" : "approved_source_unavailable", matching_reviewed_listings: sources.length ? originalCount : null, alternatives: [preview] };
  }
  const proposals = [];
  for (const field of CHANGE_FIELDS) {
    if (!present(request.intent[field])) continue;
    const values = NUMERIC[field]
      ? sources.map(({ record }) => record.facts[NUMERIC[field][0]]).filter((value) => typeof value === "number" && Number.isFinite(value) && (field.endsWith("max") ? value > request.intent[field] : value < request.intent[field]))
      : [[]];
    const unique = [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];
    unique.sort((a, b) => Math.abs(a - request.intent[field]) - Math.abs(b - request.intent[field]));
    for (const value of unique) {
      let proposed; try { proposed = alternative(field, value); } catch { continue; }
      if (proposed && proposed.matching_reviewed_listings > originalCount) { proposals.push(proposed); break; }
    }
    if (proposals.length >= 3) break;
  }
  return { ...base, status: proposals.length ? "suggestions" : sources.length ? "no_supported_alternative" : "unavailable", code: proposals.length ? "review_one_change" : sources.length ? "no_single_change_found" : "approved_source_unavailable", matching_reviewed_listings: sources.length ? originalCount : null, reviewed_inventory_size: sources.length, alternatives: proposals, message: message(input.locale, sources.length ? 0 : 2) };
}

export function publicSearchAssistant({ pathname, ...options }) {
  if (pathname === PUBLIC_SEARCH_ASSISTANT_PATHS[0]) return interpretPublicSearch(options);
  if (pathname === PUBLIC_SEARCH_ASSISTANT_PATHS[1]) return explainPublicListingMatch(options);
  if (pathname === PUBLIC_SEARCH_ASSISTANT_PATHS[2]) return suggestPublicSearchAlternatives(options);
  throw fail("unknown_search_assistant_route", options.input?.locale, [], 404);
}

export function publicSearchAssistantFailure(error, locale) {
  const status = [400, 404].includes(error?.status) ? error.status : 503;
  return { status, body: { kind: error?.code || "search_assistant_unavailable", message: message(locale, status === 400 ? 1 : 2), fields: error?.fields || [] } };
}
