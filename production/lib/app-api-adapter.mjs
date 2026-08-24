import fs from "node:fs";
import { readBuildMarker } from "./build-marker.mjs";
import { DEFAULT_CONSENT_LEDGER_PATH, appendConsentRecord, createConsentRecord } from "./consent-ledger.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, appendEvent, createEvent } from "./events.mjs";
import {
  EventStoreUnavailableError,
  eventDurableStoreConfigFromEnv,
  isEventDurableStoreEnabled,
  persistEventDurably,
} from "./event-durable-store.mjs";
import {
  DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  appendLanguageRequest,
  createLanguageRequest,
  privacySafeLanguageRequest,
} from "./language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH, appendLead } from "./lead-ledger.mjs";
import { DEFAULT_BROKER_PROFILES } from "./leads.mjs";
import {
  DEFAULT_WORKSPACE_SETTINGS_PATH,
  applyWorkspaceDefaultBroker,
  leadSlaOptions,
  readWorkspaceSettings,
} from "./workspace-settings.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH, appendLeadContact } from "./lead-contact-vault.mjs";
import {
  LeadStoreUnavailableError,
  isLeadDurableStoreEnabled,
  leadDurableStoreConfigFromEnv,
  persistLeadIntakeDurably,
} from "./lead-durable-store.mjs";
import { publicLaunchReadinessHeaders, publicLaunchReadinessPayload } from "./launch-readiness.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH, applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
// B4 media upload
import { DEFAULT_MEDIA_UPLOAD_LEDGER_PATH, applyMediaUploads, mediaUploadLimitsFromEnv, readMediaUploads } from "./media-uploads.mjs";
import { createMediaUploadStorage, mediaUploadStorageConfigFromEnv } from "./media-upload-storage.mjs";
import { SELLER_PHOTO_UPLOAD_PATH, acceptsHtmlResponse, handleSellerPhotoUpload } from "./media-upload-routes.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH, appendPublicContact } from "./public-contact-vault.mjs";
import { searchRuntimeListings, loadCmsSeed, submitRuntimeLead, DEFAULT_CMS_SEED_PATH } from "./runtime.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { clientIdentity, createRateLimiter, rateLimitConfigFromEnv } from "./rate-limit.mjs";
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
import { DEFAULT_SELLER_PIPELINE_PATH, appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { geographySuggestionsPayload, loadGeographyRegistry } from "./geography.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
import { projectListingDraftSeed } from "./listing-draft-service.mjs";
import { readHeader, requestHost, sameOriginWriteRejection } from "./request-guard.mjs";
import { productionRuntimeDataUnavailable, runtimeDataUnavailablePayload } from "./runtime-data-boundary.mjs";

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
  const durableOnly = env.NODE_ENV === "production" && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload";
  return {
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    cmsSeedPath: env.MS_REALTY_CMS_SEED_PATH || DEFAULT_CMS_SEED_PATH,
    rateLimit: rateLimitConfigFromEnv(env),
    trustProxy: env.MS_REALTY_TRUST_PROXY === "1",
    consentLedgerPath: env.MS_REALTY_CONSENT_LEDGER_PATH || DEFAULT_CONSENT_LEDGER_PATH,
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    eventDurableStore: eventDurableStoreConfigFromEnv(env),
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    workspaceSettingsPath: env.MS_REALTY_WORKSPACE_SETTINGS_PATH || DEFAULT_WORKSPACE_SETTINGS_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
    leadDurableStore: leadDurableStoreConfigFromEnv(env),
    publicContactVaultPath:
      env.MS_REALTY_PUBLIC_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_PUBLIC_CONTACT_VAULT_PATH : null),
    publicContactKey: env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    mediaUploadLedgerPath: env.MS_REALTY_MEDIA_UPLOAD_LEDGER_PATH || DEFAULT_MEDIA_UPLOAD_LEDGER_PATH,
    mediaUploadStorageConfig: mediaUploadStorageConfigFromEnv(env),
    mediaUploadLimits: mediaUploadLimitsFromEnv(env, { maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES) }),
    sellerPhotoUploadEnabled: env.MS_REALTY_SELLER_PHOTO_UPLOAD_DISABLED !== "1",
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || LAUNCH_READINESS_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    privateReview: env.MS_REALTY_PRIVATE_REVIEW_MODE === "true",
    search: publicSearchConfigFromEnv(env),
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    receivedAt: env.MS_REALTY_RECEIVED_AT,
    requestedAt: env.MS_REALTY_REQUESTED_AT,
    savedAt: env.MS_REALTY_SAVED_AT,
    sellerPipelineCreatedAt: env.MS_REALTY_SELLER_PIPELINE_CREATED_AT,
    recordSearchEventsToFile: env.NODE_ENV !== "production",
    runtimeDataDurableOnly: durableOnly,
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

// A private response of any content type. The no-JS seller-photo upload answers
// a browser form with a 303 and a text/plain body, so this cannot be
// JSON-only — it was referenced by that branch long before it existed here.
function privateResponse(status, body, contentType, headers = {}) {
  return response(status, body, contentType, { ...PRIVATE_HEADERS, ...headers });
}

function privateJson(status, body) {
  return privateResponse(status, body, "application/json; charset=utf-8");
}

// Text routes want a decoded body; a multipart photo upload needs the exact
// bytes, which a UTF-8 decode would destroy. Both views come from one read,
// because a request stream can only be consumed once.
async function readRequestBytes(request, maxBodyBytes) {
  if (!request.body) return Buffer.alloc(0);
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
  return Buffer.from(bytes);
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
  if (config.runtimeDataDurableOnly) return publicSeedFor(seed);
  const reviewedSeed = applyMediaReviews(
    // B4: uploaded listing assets join the seed before reviews are applied, so
    // an upload enters the existing review queue instead of bypassing it.
    applyMediaUploads(
      applyListingEdits(
        seed,
        readThroughCached(config.listingEditLedgerPath, () => readListingEdits(config.listingEditLedgerPath)),
      ),
      readThroughCached(config.mediaUploadLedgerPath, () => readMediaUploads(config.mediaUploadLedgerPath)),
    ),
    readThroughCached(config.mediaReviewLedgerPath, () => readMediaReviews(config.mediaReviewLedgerPath)),
  );
  return config.privateReview === true ? reviewedSeed : publicSeedFor(reviewedSeed);
}

async function currentRequestSeed(config) {
  if (!config.runtimeDataDurableOnly) return currentSeed(config);
  const seedPath = config.cmsSeedPath || DEFAULT_CMS_SEED_PATH;
  const seed = readThroughCached(seedPath, () => loadCmsSeed(seedPath));
  const projected = await projectListingDraftSeed(seed, {
    env: config.payloadListingEnv || process.env,
    payload: config.payloadListingRuntime || null,
    requirePayload: true,
  });
  return publicSeedFor(projected);
}

function currentRegistry(config) {
  const filePath = config.localeRegistryPath || DEFAULT_LOCALE_REGISTRY_PATH;
  return readThroughCached(filePath, () => loadLocaleRegistry(filePath));
}

function currentTranslationTasks(config) {
  if (config.runtimeDataDurableOnly) return [];
  const filePath = config.translationLedgerPath || DEFAULT_TRANSLATION_LEDGER_PATH;
  return readThroughCached(filePath, () => readTranslationLedger(filePath));
}

// Public (unauthenticated) write endpoints protected by the rate limiter.
const PUBLIC_WRITE_PATHS = new Set(["/api/leads", "/api/events", "/api/language-requests", "/api/saved-searches", "/api/seller-photos"]);

let sharedPublicWriteLimiter = null;

function publicWriteLimiterFor(config) {
  const settings = "rateLimit" in config ? config.rateLimit : rateLimitConfigFromEnv(process.env);
  if (!settings) return null;
  if (!sharedPublicWriteLimiter) sharedPublicWriteLimiter = createRateLimiter(settings);
  return sharedPublicWriteLimiter;
}

async function recordEvent(input, config) {
  const event = createEvent(input, config.receivedAt || new Date().toISOString());
  const durableStore = config.eventDurableStore || {};
  const durableRequested = durableStore.eventDurableStoreEnabled === true;
  if (durableRequested && !isEventDurableStoreEnabled(durableStore)) {
    throw new EventStoreUnavailableError("Durable funnel event store is enabled but not fully configured");
  }
  return durableRequested
    ? (config.persistEventDurably || persistEventDurably)(event, { payload: config.eventDurablePayload || null })
    : appendEvent(event, { filePath: config.eventLedgerPath });
}

async function recordOperationalEvent(input, config) {
  try {
    return await recordEvent(input, config);
  } catch (error) {
    if (error instanceof EventStoreUnavailableError) return null;
    throw error;
  }
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
    const durableEventsEnabled = config.eventDurableStore?.eventDurableStoreEnabled === true;
    if (!preview && (config.recordSearchEventsToFile || durableEventsEnabled)) {
      await recordOperationalEvent({ type: "search", path: requestUrl.pathname, locale: intent.locale, query, filters, sort, page }, config);
    }
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

// Workspace settings (Settings > Leads and SLA) supply the reply deadlines and
// the default broker per lead type for every new public enquiry.
function workspaceSettingsFor(config = {}) {
  const filePath = config.workspaceSettingsPath || DEFAULT_WORKSPACE_SETTINGS_PATH;
  return readThroughCached(filePath, () => readWorkspaceSettings(filePath));
}

async function routeLead(request, body, registry, seed, config) {
  try {
    const input = parseBody(request, body);
    const workspaceSettings = workspaceSettingsFor(config);
    const lead = applyWorkspaceDefaultBroker(
      submitRuntimeLead(registry, seed, input),
      workspaceSettings,
      DEFAULT_BROKER_PROFILES,
    );
    const durableStore = config.leadDurableStore || {};
    const durableRequested = durableStore.leadDurableStoreEnabled === true;
    if (config.runtimeDataDurableOnly && !durableRequested) {
      throw new LeadStoreUnavailableError("Production lead intake requires the durable store");
    }
    if (durableRequested && !isLeadDurableStoreEnabled(durableStore)) {
      throw new LeadStoreUnavailableError("Durable lead store is enabled but not fully configured");
    }
    const durable = durableRequested
      ? await (config.persistLeadIntakeDurably || persistLeadIntakeDurably)({
          lead,
          contactSecret: durableStore.contactSecret,
          marketingOptIn: input.marketingOptIn === true,
          receivedAt: config.receivedAt,
          sellerPipelineCreatedAt: config.sellerPipelineCreatedAt,
          workspaceId: durableStore.workspaceId,
        })
      : null;
    const contactVault = durable
      ? durable.contactVault
      : config.leadContactVaultPath
        ? appendLeadContact(lead, {
            filePath: config.leadContactVaultPath,
            secret: config.leadContactKey,
            storedAt: config.receivedAt,
          })
        : null;
    const ledger =
      durable?.lead ||
      appendLead(lead, {
        filePath: config.leadLedgerPath,
        receivedAt: config.receivedAt,
        contactSecret: config.leadContactKey,
        ...leadSlaOptions(workspaceSettings),
      });
    const consent = durable
      ? durable.consent
      : recordConsent(
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
    const sellerPipeline = durable
      ? durable.sellerPipeline
      : lead.lead?.leadType === "seller"
        ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: config.sellerPipelineCreatedAt }), {
            filePath: config.sellerPipelinePath,
          })
        : null;
    if (durable?.created !== false) {
      await recordOperationalEvent(
        {
          type: "lead_submitted",
          path: "/api/leads",
          locale: lead.original_language,
          listingReference: lead.lead?.listingReference,
          action: lead.lead?.source,
        },
        config,
      );
    }
    return privateJson(durable?.created === false ? 200 : 201, { ...lead, ledger, contactVault, consent, sellerPipeline });
  } catch (error) {
    if (error instanceof LeadStoreUnavailableError) {
      return privateJson(503, { kind: error.code, message: "Lead storage is temporarily unavailable" });
    }
    return privateJson(400, { kind: "bad_request", message: error.message });
  }
}

async function routeEvent(request, body, config) {
  try {
    const event = await recordEvent(parseBody(request, body), config);
    return json(201, event);
  } catch (error) {
    if (error instanceof EventStoreUnavailableError) {
      return json(503, { kind: error.code, message: "Analytics storage is temporarily unavailable" }, PRIVATE_HEADERS);
    }
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
    if (request.method === "POST" && ["/api/leads", "/api/events", SELLER_PHOTO_UPLOAD_PATH].includes(url.pathname)) {
      const forwardedProtocol = readHeader(request.headers, "x-forwarded-proto").split(",")[0].trim().toLowerCase();
      const protocol = ["http", "https"].includes(forwardedProtocol) ? forwardedProtocol : url.protocol.slice(0, -1);
      const host = requestHost(request.headers);
      const requestUrl = host ? `${protocol}://${host}${url.pathname}${url.search}` : request.url;
      const crossOrigin = sameOriginWriteRejection(request.method, request.headers, { requestUrl });
      if (crossOrigin) {
        return webResponse(privateJson(403, { kind: "cross_origin_write_blocked", reason: crossOrigin }));
      }
    }
    if (productionRuntimeDataUnavailable({
      durableEvent: config.eventDurableStore?.eventDurableStoreEnabled === true,
      durableOnly: config.runtimeDataDurableOnly,
      method: request.method,
      pathname: url.pathname,
    })) {
      return webResponse(privateJson(503, runtimeDataUnavailablePayload(url.pathname)));
    }
    const limiter = publicWriteLimiterFor(config);
    if (limiter && request.method === "POST" && PUBLIC_WRITE_PATHS.has(url.pathname)) {
      // Behind Cloudflare (trustProxy) the verified cf-connecting-ip is used;
      // otherwise there is no socket peer here, so all callers share one bucket
      // rather than letting a spoofed X-Forwarded-For mint fresh identities.
      const verdict = limiter.allow(
        `${clientIdentity({ headers: request.headers }, { trustProxy: config.trustProxy })}:${url.pathname}`,
      );
      if (!verdict.allowed) {
        return webResponse(
          json(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, {
            "retry-after": String(verdict.retryAfterSec),
            "cache-control": "no-store",
          }),
        );
      }
    }
    const bodyBytes = await readRequestBytes(request, config.maxBodyBytes);
    const body = bodyBytes.toString("utf8");

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
      const seed = await currentRequestSeed(config);
      return webResponse(await routeSearch(url, registry, seed, config, request.headers.get("x-ms-realty-preview") === "search-count"));
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      const registry = currentRegistry(config);
      const seed = await currentRequestSeed(config);
      return webResponse(await routeLead(request, body, registry, seed, config));
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      return webResponse(await routeEvent(request, body, config));
    }

    // B4 media upload: seller photos, bound to the enquiry they belong to.
    if (request.method === "POST" && url.pathname === SELLER_PHOTO_UPLOAD_PATH) {
      const sellerStoreReady = config.sellerPhotoUploadEnabled && !config.runtimeDataDurableOnly && Boolean(config.sellerPipelinePath);
      const uploaded = await handleSellerPhotoUpload({
        bytes: bodyBytes,
        contentType: request.headers.get("content-type") || "",
        acceptsHtml: acceptsHtmlResponse(request.headers.get("accept")),
        returnPath: url.searchParams.get("return") || "",
        enabled: sellerStoreReady,
        sellerEnquiries: sellerStoreReady ? readSellerPipeline(config.sellerPipelinePath) : null,
        limits: config.mediaUploadLimits || mediaUploadLimitsFromEnv(),
        storage: createMediaUploadStorage(config.mediaUploadStorageConfig || mediaUploadStorageConfigFromEnv()),
        ledgerPath: config.mediaUploadLedgerPath,
      });
      if (uploaded.status === 303) {
        return webResponse(privateResponse(303, "", "text/plain; charset=utf-8", uploaded.headers));
      }
      return webResponse(privateJson(uploaded.status, uploaded.body));
    }

    if (request.method === "POST" && url.pathname === "/api/language-requests") {
      const registry = currentRegistry(config);
      return webResponse(routeLanguageRequest(request, body, registry, config));
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      const registry = currentRegistry(config);
      const seed = await currentRequestSeed(config);
      return webResponse(routeSavedSearch(request, body, registry, seed, config));
    }

    return webResponse(json(405, { kind: "method_not_allowed" }));
  } catch (error) {
    const status = error.status || 500;
    return new Response(JSON.stringify({ kind: status === 413 ? "request_too_large" : error.code || "server_error" }), {
      status,
      headers: ERROR_JSON_HEADERS,
    });
  }
}
