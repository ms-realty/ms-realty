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
  "country_code",
  "geography_id",
  "region_id",
  "municipality",
  "district",
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
  "nl_context",
  "saved",
  "format",
  "print",
  "view",
]);
const SEARCH_INTENT_FIELD_SET = new Set(SEARCH_INTENT_INPUT_FIELDS);
const SERIALIZED_SEARCH_INTENT_FIELD_SET = new Set([...SEARCH_INTENT_INPUT_FIELDS, "mandatory_filters"]);
const EXACT_REFERENCE = /\bMS-(?:CRAWL-)?\d+\b/iu;
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

const OFFER_RULES = [
  ["rent", /(?:\b(?:for rent|rent)\b|наем|под наем)/iu],
  ["sale", /(?:\b(?:for sale|buy|sale)\b|продажба|за продажба)/iu],
];
const BEDROOM_RULE = /(?:\b(\d+)\s*bed(?:room)?s?\b|(\d+)\s*спални)/iu;
const PRICE_MAX_RULE = /(?:\b(?:under|below|up to|maximum|max)\b|до|под)\s*(?:€|eur)?\s*([\d\s.,]+)\s*(k)?\b/iu;
const PRICE_MIN_RULE = /(?:\b(?:over|above|from|minimum|min)\b|над|от)\s*(?:€|eur)?\s*([\d\s.,]+)\s*(k)?\b/iu;

// Evidence for the interpretation review uses the parser's own vocabulary.
// Every span is retained, including competing choices the legacy parser picks
// between. Public assistance can therefore ask for a choice rather than guess.
export function naturalLanguageSearchCandidates(value) {
  const text = String(value || "").trim();
  const candidates = [];
  const collect = (field, pattern, convert) => {
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      candidates.push({ field, value: convert(match), text: match[0], start: match.index, end: match.index + match[0].length });
    }
  };
  collect("exact_reference", EXACT_REFERENCE, (match) => match[0].toUpperCase());
  for (const [value, pattern] of PROPERTY_RULES) collect("property_families", pattern, () => [value]);
  for (const [value, pattern] of LOCATION_RULES) collect("location_ids", pattern, () => [value]);
  for (const [value, pattern] of OFFER_RULES) collect("offer_type", pattern, () => value);
  collect("bedrooms_min", BEDROOM_RULE, (match) => Number(match[1] || match[2]));
  collect("price_max", PRICE_MAX_RULE, parseAmount);
  collect("price_min", PRICE_MIN_RULE, parseAmount);
  return candidates;
}

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
  if (OFFER_RULES[0][1].test(text)) {
    fields.offer_type = "rent";
    structured = true;
  } else if (OFFER_RULES[1][1].test(text)) {
    fields.offer_type = "sale";
    structured = true;
  }
  const bedrooms = text.match(BEDROOM_RULE);
  if (bedrooms) {
    fields.bedrooms_min = Number(bedrooms[1] || bedrooms[2]);
    structured = true;
  }
  const priceMax = text.match(PRICE_MAX_RULE);
  if (priceMax) {
    fields.price_max = parseAmount(priceMax);
    structured = true;
  }
  const priceMin = text.match(PRICE_MIN_RULE);
  if (priceMin) {
    fields.price_min = parseAmount(priceMin);
    structured = true;
  }

  if (!structured) fields.text_query = text;
  return { intent: normalizeSearchIntent(fields, { defaultLocale }), mode: structured ? "allowlisted" : "lexical_fallback" };
}

// A browser URL is not an API call. Ad networks, mail clients and social apps
// append their own parameters to a link and the visitor never sees them: gclid
// from Google Ads, fbclid from Facebook and Instagram, utm_* from every
// newsletter and campaign. Refusing the whole request over one of those turned
// every paid click and every shared campaign link into a raw JSON error page,
// which is a far worse answer than ignoring a parameter we do not own.
//
// The strict field check stays where it belongs - on the API, where an
// unrecognised field means the caller and the contract disagree and silence
// would hide the bug. This narrows a URL to the fields search understands
// before that check ever runs.
export function searchParamsFromUrl(searchParams) {
  const source = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const known = new URLSearchParams();
  for (const [key, value] of source.entries()) {
    if (SEARCH_REQUEST_FIELDS.has(key)) known.append(key, value);
  }
  return known;
}

// Clear equivalent names before applying a later layer. Otherwise a parsed
// canonical value (including an empty array) can mask a user's form alias.
const INPUT_ALIAS_GROUPS = [
  ["text_query", "q", "query"],
  ["exact_reference", "listing_reference"],
  ["property_families", "property_family", "property_type"],
  ["property_subtypes", "property_subtype"],
  ["listing_status", "status"],
  ["price_currency", "currency"],
  ["parking_kinds", "parking_kind"],
  ["construction_statuses", "construction_status"],
  ["location_ids", "location_id", "location"],
  ["page_size", "per_page"],
  ["primary_area_min", "area_min"],
  ["primary_area_max", "area_max"],
];

export function mergeSearchInputs(...layers) {
  const merged = {};
  for (const layer of layers) {
    for (const aliases of INPUT_ALIAS_GROUPS) {
      if (aliases.some((key) => Object.hasOwn(layer, key))) {
        for (const key of aliases) delete merged[key];
      }
    }
    Object.assign(merged, layer);
  }
  return merged;
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
  // Context survives filter edits but is never parsed or sent as a lexical
  // query. Keeping the complete words avoids claiming semantic understanding
  // of wishes that this deliberately small parser cannot evaluate.
  const originalQuery = naturalLanguage || String(raw.nl_context || "").trim();
  if (originalQuery.length > 240) throw new Error("natural language search text must be 240 characters or fewer");
  const parsed = naturalLanguage && naturalLanguageEnabled
    ? parseNaturalLanguageSearchIntent(naturalLanguage, { defaultLocale: raw.locale || defaultLocale })
    : null;
  const explicit = Object.fromEntries(Object.entries(raw).filter(([key]) => SEARCH_INTENT_FIELD_SET.has(key)));
  const intent = normalizeSearchIntent(
    mergeSearchInputs(
      parsed?.intent || (naturalLanguage ? { text_query: naturalLanguage } : {}),
      filters,
      Object.fromEntries(Object.entries(encodedIntent || {}).filter(([key]) => key !== "mandatory_filters")),
      explicit,
    ),
    { defaultLocale },
  );
  return {
    intent,
    query: intent.text_query,
    filters: compactFilters(searchIntentToQueryFilters(intent)),
    sort: intent.sort,
    page: intent.page,
    natural_language: originalQuery ? {
      enabled: naturalLanguageEnabled,
      mode: parsed?.mode || (naturalLanguage ? "lexical_fallback" : "reviewed"),
      original_query: originalQuery,
    } : null,
  };
}
