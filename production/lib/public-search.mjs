import { searchRuntimeListings } from "./runtime.mjs";
import { queryPublicSearch } from "./search-engine-sync.mjs";
import { normalizeSearchRequest } from "./search-request.mjs";
import { privateSearchServiceNetworkAllowed } from "./search-service-http.mjs";
import { isProductionEnvironment, searchRuntimeEnvironment } from "./launch-service-contract.mjs";

export class PublicSearchInputError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "PublicSearchInputError";
    this.status = 400;
  }
}

export class PublicSearchUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "PublicSearchUnavailableError";
    this.status = 503;
  }
}

export function publicSearchConfigFromEnv(env = process.env) {
  const production = isProductionEnvironment(env.NODE_ENV);
  return {
    engine: "postgres",
    environment: env.NODE_ENV,
    postgres: { env: searchRuntimeEnvironment(env) },
    typesense: production ? {} : {
      baseUrl: env.TYPESENSE_URL,
      apiKey: env.TYPESENSE_API_KEY,
      queryApiKey: env.TYPESENSE_QUERY_API_KEY || env.TYPESENSE_API_KEY,
      allowPrivateNetwork: privateSearchServiceNetworkAllowed(env),
      collectionName: env.TYPESENSE_COLLECTION || "ms_realty_listings"
    },
    meilisearch: production ? {} : {
      baseUrl: env.MEILI_URL,
      apiKey: env.MEILI_API_KEY,
      queryApiKey: env.MEILI_QUERY_API_KEY || env.MEILI_API_KEY,
      allowPrivateNetwork: privateSearchServiceNetworkAllowed(env),
      indexName: env.MEILI_INDEX || "ms_realty_listings"
    },
    fetchImpl: globalThis.fetch,
    naturalLanguageEnabled: env.MS_REALTY_SEARCH_NL_INTENT_ENABLED === "true"
  };
}

function activeListingRecord(record) {
  const status = String(record?.facts?.listing_status || "available").trim().toLowerCase();
  return record?.collection === "listings" && ["available", "reserved"].includes(status);
}

export function engineLocaleCodes(seed, registry, result) {
  if ((seed.records || []).some((record) => activeListingRecord(record) && record.source_locale === result.locale)) {
    return [result.locale];
  }
  return [...new Set([result.search?.fallback?.locale || registry.source_locale, registry.source_locale].filter(Boolean))];
}

export function seedForSearchHits(seed, hits) {
  const byId = new Map(
    (seed.records || []).filter((record) => record.collection === "listings").map((record) => [record.id, record]),
  );
  const records = [];
  const seen = new Set();

  for (const hit of hits || []) {
    const id = hit.source_listing_id || hit.listing_ref || hit.id;
    if (!id || seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    records.push(byId.get(id));
  }

  return { ...seed, records };
}

function authoritativeSearchTranslation(hit) {
  return {
    locale: hit.locale,
    source_locale: hit.locale,
    status: "published",
    translation_state: "published",
    reviewer: "postgres_public_search_projection",
    human_approved: true,
    public_indexable: true,
    approved_at: "database_projection",
    listing: hit.source_listing_id,
  };
}

function postgresSearchRecord(hit, existing = null) {
  const id = String(hit?.source_listing_id || "").trim();
  const locale = String(hit?.locale || "").trim();
  const title = String(hit?.title || "").trim();
  if (!id || !locale || !title) throw new Error("Postgres public search returned an incomplete authoritative card");
  const previousFacts = existing?.facts || {};
  const translations = [
    authoritativeSearchTranslation(hit),
    ...(existing?.translations || []).filter((translation) => translation.locale !== locale),
  ];
  return {
    ...(existing || {}),
    id,
    collection: "listings",
    cms_status: "published",
    source_locale: locale,
    source_domain: existing?.source_domain || "",
    source_url: existing?.source_url || "",
    facts: {
      ...previousFacts,
      id,
      title,
      h1: title,
      description: hit.description || "",
      location: hit.location_label || hit.municipality || hit.district || "",
      municipality: hit.municipality || "",
      district: hit.district || "",
      region_id: hit.region_id || "",
      country_code: hit.country_code || "",
      geography_id: hit.geography_id || "",
      geography_path: Array.isArray(hit.geography_path) ? hit.geography_path : [],
      property_type: hit.property_family || hit.property_subtype || "property",
      offer_type: hit.offer_type || "sale",
      listing_status: hit.listing_status || "available",
      bedrooms: hit.bedrooms_count ?? null,
      bedrooms_not_applicable: false,
      area_sqm: hit.primary_area_sqm ?? null,
      condition: hit.condition || "",
      location_precision: hit.public_location_precision || null,
      price_eur: hit.price_currency === "EUR" && hit.price_on_request !== true ? hit.price_amount : null,
      price_on_request: hit.price_on_request === true,
    },
    seo: {
      ...(existing?.seo || {}),
      title,
      description: hit.description || "",
      canonical: existing?.seo?.canonical || "",
      human_approved: true,
    },
    translations,
    media: existing?.media || [],
    public_search_document: { ...hit, source_listing_id: id, locale, title },
  };
}

export function seedForPostgresSearchHits(seed, hits) {
  const byId = new Map(
    (seed.records || []).filter((record) => record.collection === "listings").map((record) => [record.id, record]),
  );
  const records = [];
  const seen = new Set();
  for (const hit of hits || []) {
    const id = String(hit?.source_listing_id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    records.push(postgresSearchRecord(hit, byId.get(id) || null));
  }
  return { ...seed, records };
}

function searchBackend(engineResult) {
  const backend = {
    engine: engineResult.engine,
    mode: engineResult.engine === "typesense" ? "primary" : engineResult.engine === "meilisearch" ? "fallback" : engineResult.engine === "postgres" ? "primary" : "local_fallback",
    locale_codes: engineResult.locale_codes,
    unavailable_engines: engineResult.unavailable_engines || []
  };
  if (Number.isFinite(engineResult.total)) backend.indexed_matches = engineResult.total;
  return backend;
}

function engineResultIsComplete(engineResult) {
  return !Number.isFinite(engineResult.total) || engineResult.total <= engineResult.hits.length;
}

function withSearchRequest(result, engineResult, request) {
  const saveSearch = result.search?.controls?.save_search;
  const controls = {
    ...result.search?.controls,
    ...(saveSearch
      ? {
          save_search: {
            ...saveSearch,
            payload: {
              ...saveSearch.payload,
              query: request.query,
              filters: { ...request.filters },
              search_intent: request.intent
            }
          }
        }
      : {})
  };

  return {
    ...result,
    search: {
      ...result.search,
      engines: [engineResult.engine],
      backend: searchBackend(engineResult),
      intent: request.intent,
      natural_language: request.natural_language,
      query: request.query,
      sort: request.sort,
      controls
    }
  };
}

function isProduction(environment) {
  return String(environment || "").toLowerCase() === "production";
}

export async function executePublicSearch({
  registry,
  seed,
  params,
  defaultLocale = registry?.source_locale,
  search = {},
  translationTasks = [],
  pageSize = 12,
  savedView = false,
  view = "list"
} = {}) {
  let request;
  try {
    request = normalizeSearchRequest(params, {
      defaultLocale,
      naturalLanguageEnabled: search.naturalLanguageEnabled === true
    });
  } catch (error) {
    throw new PublicSearchInputError(error.message, { cause: error });
  }

  const options = {
    localeCode: request.intent.locale,
    query: request.query,
    filters: request.filters,
    sort: request.sort,
    page: request.page,
    pageSize: savedView && pageSize === null ? null : request.intent.page_size,
    savedView,
    view,
    translationTasks
  };
  const localeContext = searchRuntimeListings(registry, seed, { ...options, query: "" });
  let engineResult;

  try {
    engineResult = await queryPublicSearch({
      ...search,
      q: request.query,
      intent: request.intent,
      localeCodes: engineLocaleCodes(seed, registry, localeContext)
    });
  } catch (error) {
    if (isProduction(search.environment)) {
      throw new PublicSearchUnavailableError("Search is temporarily unavailable", { cause: error });
    }
    throw error;
  }

  const databasePage = engineResult.engine === "postgres";
  const localResult = searchRuntimeListings(registry, seed, options);
  const result =
    engineResult.engine === "seed_fallback" || (!databasePage && !engineResultIsComplete(engineResult))
      ? localResult
      : searchRuntimeListings(
          registry,
          databasePage ? seedForPostgresSearchHits(seed, engineResult.hits) : seedForSearchHits(seed, engineResult.hits),
          {
          ...options,
          query: "",
          ...(databasePage
            ? {
                databasePage: true,
                pageSize: engineResult.page_size,
                totalMatches: engineResult.total,
              }
            : {}),
          },
        );

  return {
    result: withSearchRequest(result, engineResult, request),
    request,
    engineResult
  };
}
