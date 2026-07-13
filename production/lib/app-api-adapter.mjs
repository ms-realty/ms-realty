import fs from "node:fs";
import { DEFAULT_CONSENT_LEDGER_PATH, appendConsentRecord, createConsentRecord } from "./consent-ledger.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, appendEvent, createEvent } from "./events.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH, appendLanguageRequest, createLanguageRequest } from "./language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH, appendLead } from "./lead-ledger.mjs";
import { publicLaunchReadinessHeaders, publicLaunchReadinessPayload } from "./launch-readiness.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { searchRuntimeListings, loadCmsSeed, submitRuntimeLead } from "./runtime.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH, appendSavedSearch, createSavedSearch, normalizeSavedSearchInput } from "./saved-searches.mjs";
import { queryPublicSearch } from "./search-engine-sync.mjs";
import { searchFiltersFromObject, searchFiltersFromParams } from "./search-filters.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH, appendSellerPipeline, createSellerPipelineItem } from "./seller-pipeline.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";

const ERROR_JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const PRIVATE_HEADERS = { "cache-control": "no-store" };
const LAUNCH_READINESS_PATH = fromRoot("production", "data", "launch-readiness.json");

function bytesFrom(value) {
  const raw = value === undefined || value === "" ? String(10 * 1024 * 1024) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  const bytes = Number(raw);
  if (bytes < 1) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  return bytes;
}

export function appApiConfigFromEnv(env = process.env) {
  return {
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    consentLedgerPath: env.MS_REALTY_CONSENT_LEDGER_PATH || DEFAULT_CONSENT_LEDGER_PATH,
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || LAUNCH_READINESS_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    search: {
      typesense: {
        baseUrl: env.TYPESENSE_URL,
        apiKey: env.TYPESENSE_API_KEY,
        collectionName: env.TYPESENSE_COLLECTION || "ms_realty_listings",
      },
      meilisearch: {
        baseUrl: env.MEILI_URL,
        apiKey: env.MEILI_API_KEY,
        indexName: env.MEILI_INDEX || "ms_realty_listings",
      },
      fetchImpl: globalThis.fetch,
    },
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    receivedAt: env.MS_REALTY_RECEIVED_AT,
    requestedAt: env.MS_REALTY_REQUESTED_AT,
    savedAt: env.MS_REALTY_SAVED_AT,
    sellerPipelineCreatedAt: env.MS_REALTY_SELLER_PIPELINE_CREATED_AT,
  };
}

function response(status, body, contentType, headers = {}) {
  return {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": contentType, ...headers },
    body,
  };
}

function json(status, body, headers = {}) {
  return response(status, body, "application/json; charset=utf-8", headers);
}

function privateJson(status, body) {
  return response(status, body, "application/json; charset=utf-8", PRIVATE_HEADERS);
}

async function readRequestBody(request, maxBodyBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseJsonBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function parseBody(request, body) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(body));
  return parseJsonBody(body);
}

function webResponseBody(response) {
  return typeof response.body === "string" ? response.body : JSON.stringify(response.body);
}

function webResponse(response) {
  return new Response(webResponseBody(response), { status: response.status, headers: response.headers });
}

function readLaunchReadiness(filePath = LAUNCH_READINESS_PATH) {
  const sourcePath = fs.existsSync(/*turbopackIgnore: true*/ filePath) ? filePath : LAUNCH_READINESS_PATH;
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ sourcePath, "utf8"));
}

function currentSeed(config) {
  return applyListingEdits(loadCmsSeed(), readListingEdits(config.listingEditLedgerPath));
}

function recordEvent(input, config) {
  return appendEvent(createEvent(input, config.receivedAt || new Date().toISOString()), { filePath: config.eventLedgerPath });
}

function recordConsent(input, config) {
  return appendConsentRecord(createConsentRecord(input, config.receivedAt || new Date().toISOString()), {
    filePath: config.consentLedgerPath,
  });
}

function activeListingRecord(record) {
  const status = String(record.facts?.listing_status || "available").trim().toLowerCase();
  return record.collection === "listings" && ["available", "reserved"].includes(status);
}

function engineLocaleCodes(seed, registry, result) {
  if (seed.records.some((record) => activeListingRecord(record) && record.source_locale === result.locale)) {
    return [result.locale];
  }
  return [...new Set([result.search.fallback?.locale || registry.source_locale, registry.source_locale].filter(Boolean))];
}

function seedForSearchHits(seed, hits) {
  const recordsById = new Map(
    seed.records.filter((record) => record.collection === "listings").map((record) => [record.id, record]),
  );
  const seen = new Set();
  const records = [];
  for (const hit of hits) {
    const id = String(hit.source_listing_id || "").trim();
    const record = recordsById.get(id);
    if (!record || seen.has(id)) continue;
    seen.add(id);
    records.push(record);
  }
  return { ...seed, records };
}

function withSearchBackend(result, engineResult) {
  const backend = {
    engine: engineResult.engine,
    mode: engineResult.engine === "typesense" ? "primary" : engineResult.engine === "meilisearch" ? "fallback" : "local_fallback",
    locale_codes: engineResult.locale_codes,
    unavailable_engines: engineResult.unavailable_engines,
  };
  if (Number.isFinite(engineResult.total)) backend.indexed_matches = engineResult.total;
  return {
    ...result,
    search: {
      ...result.search,
      engines: [engineResult.engine],
      backend,
    },
  };
}

async function routeSearch(requestUrl, registry, seed, config) {
  const localeCode = requestUrl.searchParams.get("locale") || "bg";
  const query = requestUrl.searchParams.get("q") || "";
  const filters = searchFiltersFromParams(requestUrl.searchParams);
  const translationTasks = readTranslationLedger(config.translationLedgerPath);
  const localResult = searchRuntimeListings(registry, seed, {
    localeCode,
    query,
    filters,
    translationTasks,
  });
  const engineResult = await queryPublicSearch({
    ...(config.search || {}),
    q: query,
    localeCodes: engineLocaleCodes(seed, registry, localResult),
  });
  const result =
    engineResult.engine === "seed_fallback"
      ? localResult
      : searchRuntimeListings(registry, seedForSearchHits(seed, engineResult.hits), {
          localeCode,
          query,
          filters,
          translationTasks,
        });
  recordEvent({ type: "search", path: requestUrl.pathname, locale: localeCode, query, filters }, config);
  return json(200, withSearchBackend(result, engineResult));
}

function routeLead(request, body, registry, seed, config) {
  try {
    const input = parseBody(request, body);
    const lead = submitRuntimeLead(registry, seed, input);
    const ledger = appendLead(lead, { filePath: config.leadLedgerPath, receivedAt: config.receivedAt });
    const consent = recordConsent(
      {
        consentType: "inquiry_follow_up",
        source: lead.lead?.source,
        subjectId: lead.lead?.id,
        locale: lead.original_language,
        contact: lead.lead?.contact,
        marketingOptIn: input.marketingOptIn === true,
      },
      config,
    );
    const sellerPipeline =
      lead.lead?.leadType === "seller"
        ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: config.sellerPipelineCreatedAt }), {
            filePath: config.sellerPipelinePath,
          })
        : null;
    recordEvent(
      {
        type: "lead_submitted",
        path: "/api/leads",
        locale: lead.original_language,
        listingReference: lead.lead?.listingReference,
        action: lead.lead?.source,
      },
      config,
    );
    return privateJson(201, { ...lead, ledger, consent, sellerPipeline });
  } catch (error) {
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

function routeEvent(request, body, config) {
  try {
    const event = createEvent(parseBody(request, body), config.receivedAt || new Date().toISOString());
    const ledger = appendEvent(event, { filePath: config.eventLedgerPath });
    return json(201, { ...event, ledger });
  } catch (error) {
    return json(400, { kind: "bad_request", message: error.message });
  }
}

function routeLanguageRequest(body, registry, config) {
  try {
    const input = parseJsonBody(body);
    const requestRow = createLanguageRequest(registry, input, config.requestedAt);
    const ledger = appendLanguageRequest(requestRow, { filePath: config.languageRequestPath });
    const consent = recordConsent(
      {
        consentType: "language_request",
        source: "website_language_request",
        subjectId: requestRow.id,
        locale: requestRow.requested_locale,
        contact: requestRow.contact,
        marketingOptIn: input.marketingOptIn === true,
      },
      config,
    );
    return privateJson(201, { ...requestRow, ledger, consent });
  } catch (error) {
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

function routeSavedSearch(request, body, registry, seed, config) {
  try {
    const input = normalizeSavedSearchInput(parseBody(request, body));
    const filters = searchFiltersFromObject(input.filters);
    const search = searchRuntimeListings(registry, seed, {
      localeCode: input.locale || registry.source_locale,
      query: input.query || "",
      filters,
      translationTasks: readTranslationLedger(config.translationLedgerPath),
    });
    const priceSnapshot = Object.fromEntries(
      search.cards.map((card) => [card.id, Number(card.price_eur)]).filter(([, price]) => Number.isFinite(price)),
    );
    const savedSearch = createSavedSearch(registry, { ...input, filters, priceSnapshot }, { matchCount: search.search.total_matches, savedAt: config.savedAt });
    const ledger = appendSavedSearch(savedSearch, { filePath: config.savedSearchLedgerPath });
    const consent = recordConsent(
      {
        consentType: "saved_search_alerts",
        source: "website_saved_search",
        subjectId: savedSearch.id,
        locale: savedSearch.requested_locale,
        contact: savedSearch.contact,
        legalBasis: "consent",
        marketingOptIn: input.marketingOptIn === true,
      },
      config,
    );
    return privateJson(201, { ...savedSearch, ledger, consent });
  } catch (error) {
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

export async function renderAppApiResponse(request, { config = appApiConfigFromEnv() } = {}) {
  try {
    const url = new URL(request.url, "http://localhost");
    const body = await readRequestBody(request, config.maxBodyBytes);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const readiness = readLaunchReadiness(config.launchReadinessOutputPath);
      return webResponse(
        json(200, {
          kind: "health",
          service: "ms-realty",
          status: "ok",
          launch_ready: readiness.launch_ready,
          blockers: readiness.blockers,
        }),
      );
    }

    if (request.method === "GET" && url.pathname === "/api/ready") {
      const readiness = readLaunchReadiness(config.launchReadinessOutputPath);
      return webResponse(
        json(
          readiness.launch_ready ? 200 : 503,
          publicLaunchReadinessPayload(readiness),
          publicLaunchReadinessHeaders(readiness),
        ),
      );
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const registry = loadLocaleRegistry(config.localeRegistryPath);
      const seed = currentSeed(config);
      return webResponse(await routeSearch(url, registry, seed, config));
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      const registry = loadLocaleRegistry(config.localeRegistryPath);
      const seed = currentSeed(config);
      return webResponse(routeLead(request, body, registry, seed, config));
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      return webResponse(routeEvent(request, body, config));
    }

    if (request.method === "POST" && url.pathname === "/api/language-requests") {
      const registry = loadLocaleRegistry(config.localeRegistryPath);
      return webResponse(routeLanguageRequest(body, registry, config));
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      const registry = loadLocaleRegistry(config.localeRegistryPath);
      const seed = currentSeed(config);
      return webResponse(routeSavedSearch(request, body, registry, seed, config));
    }

    return webResponse(json(405, { kind: "method_not_allowed" }));
  } catch (error) {
    const status = error.status || 500;
    return new Response(JSON.stringify({ kind: status === 413 ? "request_too_large" : "server_error" }), {
      status,
      headers: ERROR_JSON_HEADERS,
    });
  }
}
