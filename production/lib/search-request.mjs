import { SEARCH_INTENT_SCHEMA_VERSION, normalizeSearchIntent, searchIntentToQueryFilters } from "./search-intent.mjs";

export const SEARCH_INTENT_INPUT_FIELDS = Object.freeze([
  "schema_version",
  "locale",
  "text_query",
  "q",
  "query",
  "exact_reference",
  "listing_reference",
  "property_families",
  "property_family",
  "property_type",
  "property_subtypes",
  "property_subtype",
  "offer_type",
  "listing_status",
  "status",
  "price_currency",
  "currency",
  "price_period",
  "parking_kinds",
  "parking_kind",
  "construction_statuses",
  "construction_status",
  "has_approved_tour",
  "location_ids",
  "location_id",
  "location",
  "map_bounds",
  "radius",
  "sort",
  "page",
  "page_size",
  "per_page",
  "price_min",
  "price_max",
  "bedrooms_min",
  "bedrooms_max",
  "premises_min",
  "hotel_rooms_min",
  "primary_area_min",
  "primary_area_max",
  "area_min",
  "area_max",
  "land_area_min",
  "land_area_max",
  "floor_min",
  "floor_max",
  "storeys_min",
  "storeys_max",
]);

const SEARCH_REQUEST_FIELDS = new Set([
  ...SEARCH_INTENT_INPUT_FIELDS,
  "filters",
  "search_intent",
  "intent",
  "nl",
  "saved",
  "format",
  "print",
  "view",
]);
const SEARCH_INTENT_FIELD_SET = new Set(SEARCH_INTENT_INPUT_FIELDS);
const SERIALIZED_SEARCH_INTENT_FIELD_SET = new Set([...SEARCH_INTENT_INPUT_FIELDS, "mandatory_filters"]);
const EXACT_REFERENCE = /\bMS-CRAWL-\d{4,}\b/iu;
const UNSAFE_NL = /(?:<[^>]+>|\b(?:ignore|override|system|developer|prompt|instruction|tool|hermes|assistant|chat|publish|send)\b|https?:\/\/|javascript:)/iu;
const PROPERTY_RULES = [
  ["apartment", /(?:\b(?:apartment|apartments)\b|апартамент(?:и)?)/iu],
  ["house", /(?:\b(?:house|houses|villa)\b|вила|къща|къщи)/iu],
  ["plot", /(?:\b(?:plot|land plot|parcel)\b|парцел|урегулиран)/iu],
  ["agricultural_land", /(?:\b(?:agricultural land|farmland)\b|земеделска земя|нива)/iu],
  ["commercial", /(?:\b(?:commercial|office|shop|retail)\b|търговск[аи]?|офис|магазин)/iu],
  ["hotel", /(?:\bhotel\b|хотел)/iu],
];
const LOCATION_RULES = [
  ["Sandanski", /(?:\bsandanski\b|сандански)/iu],
  ["Petrich", /(?:\bpetrich\b|петрич)/iu],
  ["Bansko", /(?:\bbansko\b|банско)/iu],
  ["Hotovo", /(?:\bhotovo\b|хотово)/iu],
  ["Sveti Vlas", /(?:\bsveti vlas\b|свети влас)/iu],
];

function objectInput(input) {
  if (input instanceof URLSearchParams) return Object.fromEntries(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("search input must be an object");
  return input;
}

function parseJsonObject(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") throw new Error(`${field} must be an object or valid JSON`);
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${field} must be an object or valid JSON`);
  }
}

function assertKnownFields(input, allowed, label) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function assertIntentVersion(input) {
  if (input?.schema_version !== undefined && Number(input.schema_version) !== SEARCH_INTENT_SCHEMA_VERSION) {
    throw new Error(`search_intent.schema_version must be ${SEARCH_INTENT_SCHEMA_VERSION}`);
  }
}

function assertMandatoryFilters(input, defaultLocale) {
  if (!input?.mandatory_filters) return;
  if (!input.mandatory_filters || typeof input.mandatory_filters !== "object" || Array.isArray(input.mandatory_filters)) {
    throw new Error("search_intent.mandatory_filters must be an object");
  }
  const expected = normalizeSearchIntent({}, { defaultLocale }).mandatory_filters;
  assertKnownFields(input.mandatory_filters, new Set(Object.keys(expected)), "search_intent.mandatory_filters");
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(input.mandatory_filters[key]) !== JSON.stringify(value)) {
      throw new Error("search_intent.mandatory_filters cannot be changed");
    }
  }
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function parseAmount(match) {
  const raw = String(match?.[1] || "").trim();
  const suffix = String(match?.[2] || "").toLowerCase();
  if (!raw) return null;
  const amount = suffix === "k" ? Number(raw.replace(",", ".")) * 1000 : Number(raw.replace(/[\s,\.]/gu, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new Error("natural language price is not supported");
  return amount;
}

/**
 * A deliberately small query parser. It recognizes only allowlisted property
 * vocabulary and otherwise preserves the text as a normal lexical query.
 */
export function parseNaturalLanguageSearchIntent(value, { defaultLocale = "bg" } = {}) {
  const text = String(value || "").trim();
  if (!text) throw new Error("natural language search text is required");
  if (text.length > 240) throw new Error("natural language search text must be 240 characters or fewer");
  if (UNSAFE_NL.test(text)) throw new Error("natural language search contains unsupported instructions");

  const exactReference = text.match(EXACT_REFERENCE)?.[0];
  if (exactReference) {
    return {
      intent: normalizeSearchIntent({ locale: defaultLocale, exact_reference: exactReference.toUpperCase() }, { defaultLocale }),
      mode: "exact_reference",
    };
  }

  const fields = { locale: defaultLocale };
  let structured = false;
  for (const [family, pattern] of PROPERTY_RULES) {
    if (pattern.test(text)) {
      fields.property_families = [family];
      structured = true;
      break;
    }
  }
  for (const [location, pattern] of LOCATION_RULES) {
    if (pattern.test(text)) {
      fields.location_ids = [location];
      structured = true;
      break;
    }
  }
  if (/(?:\b(?:for rent|rent)\b|наем|под наем)/iu.test(text)) {
    fields.offer_type = "rent";
    structured = true;
  } else if (/(?:\b(?:for sale|buy|sale)\b|продажба|за продажба)/iu.test(text)) {
    fields.offer_type = "sale";
    structured = true;
  }
  const bedrooms = text.match(/(?:\b(\d+)\s*bed(?:room)?s?\b|(\d+)\s*спални)/iu);
  if (bedrooms) {
    fields.bedrooms_min = Number(bedrooms[1] || bedrooms[2]);
    structured = true;
  }
  const priceMax = text.match(/(?:\b(?:under|below|up to|maximum|max)\b|до|под)\s*(?:€|eur)?\s*([\d\s.,]+)\s*(k)?\b/iu);
  if (priceMax) {
    fields.price_max = parseAmount(priceMax);
    structured = true;
  }
  const priceMin = text.match(/(?:\b(?:over|above|from|minimum|min)\b|над|от)\s*(?:€|eur)?\s*([\d\s.,]+)\s*(k)?\b/iu);
  if (priceMin) {
    fields.price_min = parseAmount(priceMin);
    structured = true;
  }

  if (!structured) fields.text_query = text;
  return { intent: normalizeSearchIntent(fields, { defaultLocale }), mode: structured ? "allowlisted" : "lexical_fallback" };
}

export function normalizeSearchRequest(input, { defaultLocale = "bg", naturalLanguageEnabled = false } = {}) {
  const raw = objectInput(input);
  assertKnownFields(raw, SEARCH_REQUEST_FIELDS, "search request");
  assertIntentVersion(raw);
  const filters = parseJsonObject(raw.filters, "filters") || {};
  assertKnownFields(filters, SEARCH_INTENT_FIELD_SET, "filters");
  assertIntentVersion(filters);
  const encodedIntent = parseJsonObject(raw.search_intent ?? raw.intent, "search_intent");
  if (encodedIntent) {
    assertKnownFields(encodedIntent, SERIALIZED_SEARCH_INTENT_FIELD_SET, "search_intent");
    assertIntentVersion(encodedIntent);
    assertMandatoryFilters(encodedIntent, raw.locale || defaultLocale);
  }
  const naturalLanguage = String(raw.nl || "").trim();
  if (naturalLanguage && naturalLanguageEnabled) {
    const parsed = parseNaturalLanguageSearchIntent(naturalLanguage, { defaultLocale: raw.locale || defaultLocale });
    return {
      intent: parsed.intent,
      query: parsed.intent.text_query,
      filters: compactFilters(searchIntentToQueryFilters(parsed.intent)),
      sort: parsed.intent.sort,
      page: parsed.intent.page,
      natural_language: { enabled: true, mode: parsed.mode },
    };
  }
  const intent = normalizeSearchIntent(
    {
      ...filters,
      ...Object.fromEntries(Object.entries(encodedIntent || {}).filter(([key]) => key !== "mandatory_filters")),
      ...Object.fromEntries(Object.entries(raw).filter(([key]) => SEARCH_INTENT_FIELD_SET.has(key))),
      ...(naturalLanguage && !raw.q && !raw.query && !raw.text_query ? { text_query: naturalLanguage } : {}),
    },
    { defaultLocale },
  );
  return {
    intent,
    query: intent.text_query,
    filters: compactFilters(searchIntentToQueryFilters(intent)),
    sort: intent.sort,
    page: intent.page,
    natural_language: naturalLanguage ? { enabled: false, mode: "lexical_fallback" } : null,
  };
}
