import fs from "node:fs";
import { readBuildMarker } from "./build-marker.mjs";
import { DEFAULT_CONSENT_LEDGER_PATH, appendConsentRecord, createConsentRecord } from "./consent-ledger.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, appendEvent, createEvent } from "./events.mjs";
import {
  DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  appendLanguageRequest,
  createLanguageRequest,
  privacySafeLanguageRequest,
} from "./language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH, appendLead } from "./lead-ledger.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH, appendLeadContact } from "./lead-contact-vault.mjs";
import { publicLaunchReadinessHeaders, publicLaunchReadinessPayload } from "./launch-readiness.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH, applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH, appendPublicContact } from "./public-contact-vault.mjs";
import { searchRuntimeListings, loadCmsSeed, submitRuntimeLead, DEFAULT_CMS_SEED_PATH } from "./runtime.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { clientIpFromHeaders, createRateLimiter, rateLimitConfigFromEnv } from "./rate-limit.mjs";
import {
  DEFAULT_SAVED_SEARCH_LEDGER_PATH,
  appendSavedSearch,
  createSavedSearch,
  normalizeSavedSearchInput,
  privacySafeSavedSearch,
  savedSearchIntent,
} from "./saved-searches.mjs";
import {
  executePublicSearch,
  PublicSearchInputError,
  PublicSearchUnavailableError,
  publicSearchConfigFromEnv,
} from "./public-search.mjs";
import { searchIntentToQueryFilters } from "./search-intent.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH, appendSellerPipeline, createSellerPipelineItem } from "./seller-pipeline.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { geographySuggestionsPayload, loadGeographyRegistry } from "./geography.mjs";

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
const DEFAULT_LOCALE_REGISTRY_PATH = fromRoot("locales", "registry.json");

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
    cmsSeedPath: env.MS_REALTY_CMS_SEED_PATH || DEFAULT_CMS_SEED_PATH,
    rateLimit: rateLimitConfigFromEnv(env),
    consentLedgerPath: env.MS_REALTY_CONSENT_LEDGER_PATH || DEFAULT_CONSENT_LEDGER_PATH,
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
    publicContactVaultPath:
      env.MS_REALTY_PUBLIC_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_PUBLIC_CONTACT_VAULT_PATH : null),
    publicContactKey: env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || LAUNCH_READINESS_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    search: publicSearchConfigFromEnv(env),
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
  const seedPath = config.cmsSeedPath || DEFAULT_CMS_SEED_PATH;
  const seed = readThroughCached(seedPath, () => loadCmsSeed(seedPath));
  return applyMediaReviews(
    applyListingEdits(
      seed,
      readThroughCached(config.listingEditLedgerPath, () => readListingEdits(config.listingEditLedgerPath)),
    ),
    readThroughCached(config.mediaReviewLedgerPath, () => readMediaReviews(config.mediaReviewLedgerPath)),
  );
}

function currentRegistry(config) {
  const filePath = config.localeRegistryPath || DEFAULT_LOCALE_REGISTRY_PATH;
  return readThroughCached(filePath, () => loadLocaleRegistry(filePath));
}

function currentTranslationTasks(config) {
  const filePath = config.translationLedgerPath || DEFAULT_TRANSLATION_LEDGER_PATH;
  return readThroughCached(filePath, () => readTranslationLedger(filePath));
}

// Public (unauthenticated) write endpoints protected by the rate limiter.
const PUBLIC_WRITE_PATHS = new Set(["/api/leads", "/api/events", "/api/language-requests", "/api/saved-searches"]);

let sharedPublicWriteLimiter = null;

function publicWriteLimiterFor(config) {
  const settings = "rateLimit" in config ? config.rateLimit : rateLimitConfigFromEnv(process.env);
  if (!settings) return null;
  if (!sharedPublicWriteLimiter) sharedPublicWriteLimiter = createRateLimiter(settings);
  return sharedPublicWriteLimiter;
}

function recordEvent(input, config) {
  return appendEvent(createEvent(input, config.receivedAt || new Date().toISOString()), { filePath: config.eventLedgerPath });
}

function recordConsent(input, config) {
  return appendConsentRecord(createConsentRecord(input, config.receivedAt || new Date().toISOString()), {
    filePath: config.consentLedgerPath,
  });
}

async function routeSearch(requestUrl, registry, seed, config, preview = false) {
  try {
    const { result, request } = await executePublicSearch({
      registry,
      seed,
      params: requestUrl.searchParams,
      defaultLocale: requestUrl.searchParams.get("locale") || registry.source_locale,
      search: config.search,
      translationTasks: currentTranslationTasks(config),
    });
    const { intent, query, filters, sort, page } = request;
    if (!preview) recordEvent({ type: "search", path: requestUrl.pathname, locale: intent.locale, query, filters, sort, page }, config);
    return json(200, result);
  } catch (error) {
    if (error instanceof PublicSearchInputError) {
      return json(400, { kind: "bad_request", message: error.message });
    }
    if (error instanceof PublicSearchUnavailableError) {
      return json(503, { kind: "search_unavailable", message: "Search is temporarily unavailable" });
    }
    throw error;
  }
}

function routeLead(request, body, registry, seed, config) {
  try {
    const input = parseBody(request, body);
    const lead = submitRuntimeLead(registry, seed, input);
    const contactVault = config.leadContactVaultPath
      ? appendLeadContact(lead, {
          filePath: config.leadContactVaultPath,
          secret: config.leadContactKey,
          storedAt: config.receivedAt,
        })
      : null;
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
    return privateJson(201, { ...lead, ledger, contactVault, consent, sellerPipeline });
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

function routeLanguageRequest(request, body, registry, config) {
  try {
    const input = parseBody(request, body);
    const requestRow = createLanguageRequest(registry, input, config.requestedAt);
    if (requestRow.notification_requested && !config.publicContactVaultPath) {
      throw new Error("Public contact delivery storage is not configured");
    }
    const contactVault =
      requestRow.notification_requested && config.publicContactVaultPath
        ? appendPublicContact(
            {
              subjectType: "language_request",
              subjectId: requestRow.id,
              contact: requestRow.contact,
              message: requestRow.message,
            },
            {
              filePath: config.publicContactVaultPath,
              secret: config.publicContactKey,
              storedAt: config.requestedAt,
              includeMessage: true,
            },
          )
        : null;
    const safeRequest = privacySafeLanguageRequest(requestRow);
    const ledger = appendLanguageRequest(safeRequest, { filePath: config.languageRequestPath });
    const consent = requestRow.notification_requested
      ? recordConsent(
          {
            consentType: "language_request",
            source: "website_language_request",
            subjectId: requestRow.id,
            locale: requestRow.requested_locale,
            contact: requestRow.contact,
            granted: true,
            legalBasis: "consent",
            marketingOptIn: input.marketingOptIn === true,
          },
          config,
        )
      : null;
    return privateJson(201, { ...safeRequest, ledger, contactVault, consent });
  } catch (error) {
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

function routeSavedSearch(request, body, registry, seed, config) {
  try {
    const input = normalizeSavedSearchInput(parseBody(request, body));
    const intent = savedSearchIntent(registry, input);
    const filters = Object.fromEntries(
      Object.entries(searchIntentToQueryFilters(intent)).filter(([, value]) => value !== "" && value !== null && value !== undefined),
    );
    const search = searchRuntimeListings(registry, seed, {
      localeCode: intent.locale,
      query: intent.text_query,
      filters,
      sort: intent.sort,
      page: intent.page,
      pageSize: null,
      translationTasks: currentTranslationTasks(config),
    });
    const priceSnapshot = Object.fromEntries(
      search.cards.map((card) => [card.id, Number(card.price_eur)]).filter(([, price]) => Number.isFinite(price)),
    );
    const savedSearch = createSavedSearch(
      registry,
      { ...input, search_intent: intent, priceSnapshot },
      { matchCount: search.search.total_matches, savedAt: config.savedAt },
    );
    if (!config.publicContactVaultPath) throw new Error("Public contact delivery storage is not configured");
    const contactVault = config.publicContactVaultPath
      ? appendPublicContact(
          {
            subjectType: "saved_search",
            subjectId: savedSearch.id,
            contact: savedSearch.contact,
            contactPreference: savedSearch.contact_preference,
          },
          { filePath: config.publicContactVaultPath, secret: config.publicContactKey, storedAt: config.savedAt },
        )
      : null;
    const safeSearch = privacySafeSavedSearch(savedSearch);
    const ledger = appendSavedSearch(safeSearch, { filePath: config.savedSearchLedgerPath });
    const consent = recordConsent(
      {
        consentType: "saved_search_alerts",
        source: "website_saved_search",
        subjectId: savedSearch.id,
        locale: savedSearch.requested_locale,
        contact: savedSearch.contact,
        granted: savedSearch.alert_consent === true,
        legalBasis: "consent",
        marketingOptIn: input.marketingOptIn === true,
      },
      config,
    );
    return privateJson(201, { ...safeSearch, ledger, contactVault, consent });
  } catch (error) {
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

export async function renderAppApiResponse(request, { config = appApiConfigFromEnv() } = {}) {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/hermes/chat") {
      return webResponse(privateJson(404, { kind: "not_found" }));
    }
    const limiter = publicWriteLimiterFor(config);
    if (limiter && request.method === "POST" && PUBLIC_WRITE_PATHS.has(url.pathname)) {
      const verdict = limiter.allow(`${clientIpFromHeaders(request.headers)}:${url.pathname}`);
      if (!verdict.allowed) {
        return webResponse(
          json(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, {
            "retry-after": String(verdict.retryAfterSec),
            "cache-control": "no-store",
          }),
        );
      }
    }
    const body = await readRequestBody(request, config.maxBodyBytes);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const readiness = readLaunchReadiness(config.launchReadinessOutputPath);
      return webResponse(
        json(200, {
          kind: "health",
          service: "ms-realty",
          status: "ok",
          build_marker: readBuildMarker(),
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

    if (request.method === "GET" && url.pathname === "/api/geography") {
      return webResponse(
        json(
          200,
          geographySuggestionsPayload(loadGeographyRegistry(), {
            query: url.searchParams.get("q") || "",
            countryCode: (url.searchParams.get("country") || "").toUpperCase() || undefined,
            levels: url.searchParams
              .getAll("level")
              .flatMap((value) => value.split(","))
              .filter(Boolean),
            parentId: url.searchParams.get("parent_id") || undefined,
            ancestorId: url.searchParams.get("ancestor_id") || undefined,
            limit: url.searchParams.get("limit") || 20,
          }),
          { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
        ),
      );
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const registry = currentRegistry(config);
      const seed = currentSeed(config);
      return webResponse(await routeSearch(url, registry, seed, config, request.headers.get("x-ms-realty-preview") === "search-count"));
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      const registry = currentRegistry(config);
      const seed = currentSeed(config);
      return webResponse(routeLead(request, body, registry, seed, config));
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      return webResponse(routeEvent(request, body, config));
    }

    if (request.method === "POST" && url.pathname === "/api/language-requests") {
      const registry = currentRegistry(config);
      return webResponse(routeLanguageRequest(request, body, registry, config));
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      const registry = currentRegistry(config);
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
