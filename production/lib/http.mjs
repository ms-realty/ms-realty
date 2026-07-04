import fs from "node:fs";
import { addLocaleToRegistry, loadLocaleRegistry, writeLocaleRegistry } from "./locales.mjs";
import { renderHtmlPage } from "./html.mjs";
import { appendLead, readLeadLedger } from "./lead-ledger.mjs";
import { appendReviewedReply, readReplyOutbox } from "./lead-replies.mjs";
import { appendBrokerContact, createBrokerContact, readBrokerContacts } from "./broker-contacts.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import {
  approveTranslationTask,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "./admin-workflows.mjs";
import {
  appendRedirectApproval,
  buildDeployableRedirects,
  loadDeployableRedirects,
  readRedirectApprovals,
} from "./redirect-approvals.mjs";
import { appendLanguageRequest, createLanguageRequest, readLanguageRequests } from "./language-requests.mjs";
import { appendTranslationTask, latestTranslationTasks, readTranslationLedger } from "./translation-ledger.mjs";
import { appendListingEdit, createListingEdit, readListingEdits } from "./listing-edits.mjs";
import { appendViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
import { appendSavedSearch, createSavedSearch, readSavedSearches } from "./saved-searches.mjs";
import { appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import { fromRoot } from "./paths.mjs";

function response(status, body, contentType, headers = {}) {
  return {
    status,
    headers: { "content-type": contentType, ...headers },
    body,
  };
}

function json(status, body) {
  return response(status, body, "application/json; charset=utf-8");
}

function wantsHtml(request, url) {
  const accept = request.headers?.accept || request.headers?.Accept || "";
  return url.searchParams.get("format") === "html" || accept.includes("text/html");
}

function wantsPrint(url, rendered) {
  return rendered.kind === "listing" && url.searchParams.get("print") === "1";
}

function publicResponse(request, url, rendered) {
  if (wantsPrint(url, rendered)) {
    return response(rendered.status || 200, renderHtmlPage(rendered, { print: true }), "text/html; charset=utf-8");
  }
  if (wantsHtml(request, url)) return response(rendered.status || 200, renderHtmlPage(rendered), "text/html; charset=utf-8");
  return json(rendered.status || 200, rendered);
}

const SEARCH_FILTER_FIELDS = ["location", "property_type", "offer_type", "price_min", "price_max", "bedrooms_min"];

function loadLegacyRouteMap(filePath = fromRoot("production", "data", "legacy-route-map.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")).routes || [];
}

function loadMigrationReviewDashboard(filePath = fromRoot("production", "data", "migration-review-dashboard.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function searchFiltersFromObject(input = {}) {
  const filters = {};
  for (const field of SEARCH_FILTER_FIELDS) {
    const value = input[field];
    if (value) filters[field] = value;
  }
  return filters;
}

function searchFiltersFromParams(params) {
  return searchFiltersFromObject(Object.fromEntries(params));
}

export function createHttpApp({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  redirects = loadDeployableRedirects(),
  routeMap = loadLegacyRouteMap(),
  migrationReviewDashboard = loadMigrationReviewDashboard(),
  leadLedgerPath = null,
  replyOutboxPath = null,
  languageRequestPath = null,
  translationLedgerPath = null,
  listingEditLedgerPath = null,
  viewingLedgerPath = null,
  savedSearchLedgerPath = null,
  sellerPipelinePath = null,
  brokerContactLedgerPath = null,
  redirectApprovalPath = null,
  localeRegistryPath = null,
  receivedAt,
  requestedAt,
  editedAt,
  reviewedAt,
  bookedAt,
  savedAt,
  sellerPipelineCreatedAt,
} = {}) {
  let activeRegistry = registry;
  return async function handle(request) {
    const url = new URL(request.url, "http://localhost");
    const auth = request.headers?.authorization || request.headers?.Authorization || "";
    const host =
      request.headers?.["x-forwarded-host"] ||
      request.headers?.["X-Forwarded-Host"] ||
      request.headers?.host ||
      request.headers?.Host;
    const legacyUrl = request.url.startsWith("http") ? url.href : host ? `https://${host}${url.pathname}${url.search}` : "";
    const legacyRedirect = request.method === "GET" ? redirects.find((row) => row.old_url === legacyUrl) : null;

    if (legacyRedirect) {
      return response(
        301,
        { kind: "legacy_redirect", location: legacyRedirect.target_path },
        "application/json; charset=utf-8",
        { location: legacyRedirect.target_path },
      );
    }

    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      return response(
        200,
        renderSitemapXml(buildRuntimeLocalizedSitemap(activeRegistry, seed, readTranslationLedger(translationLedgerPath || undefined))),
        "application/xml; charset=utf-8",
      );
    }

    if (request.method === "GET" && url.pathname === "/robots.txt") {
      return response(200, renderRobotsTxt(), "text/plain; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const localeCode = url.searchParams.get("locale") || "bg";
      const query = url.searchParams.get("q") || "";
      return json(
        200,
        searchRuntimeListings(activeRegistry, seed, {
          localeCode,
          query,
          filters: searchFiltersFromParams(url.searchParams),
          translationTasks: readTranslationLedger(translationLedgerPath || undefined),
        }),
      );
    }

    if (request.method === "GET") {
      const normalized = url.pathname.replace(/\/$/, "");
      const searchLocale = activeRegistry.locales.find(
        (locale) => locale.route_segments?.search && `/${locale.code}/${locale.route_segments.search}` === normalized,
      );
      if (searchLocale) {
        return publicResponse(
          request,
          url,
          searchRuntimeListings(activeRegistry, seed, {
            localeCode: searchLocale.code,
            query: url.searchParams.get("q") || "",
            filters: searchFiltersFromParams(url.searchParams),
            translationTasks: readTranslationLedger(translationLedgerPath || undefined),
          }),
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      const requestedLocale = url.searchParams.get("locale") || "en";
      return json(200, {
        workspace: renderAdminWorkspace({ registry: activeRegistry, requestedLocale }),
        leads: readLeadLedger(leadLedgerPath || undefined),
        replies: readReplyOutbox(replyOutboxPath || undefined),
        languageRequests: readLanguageRequests(languageRequestPath || undefined),
        translationTasks: latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)),
        listingEdits: readListingEdits(listingEditLedgerPath || undefined),
        viewings: readViewings(viewingLedgerPath || undefined),
        savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
        sellerPipeline: readSellerPipeline(sellerPipelinePath || undefined),
        brokerContacts: readBrokerContacts(brokerContactLedgerPath || undefined),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      return response(
        200,
        renderViewingCalendar(readViewings(viewingLedgerPath || undefined), { now: bookedAt || receivedAt }),
        "text/calendar; charset=utf-8",
        { "content-disposition": "attachment; filename=\"ms-realty-viewings.ics\"" },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/locales") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      const requestedLocale = url.searchParams.get("locale") || "en";
      return json(200, {
        workspace: renderAdminWorkspace({ registry: activeRegistry, requestedLocale }),
        locales: activeRegistry.locales,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/migration/review") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      const requestedLocale = url.searchParams.get("locale") || "en";
      const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
      return json(200, {
        workspace: renderAdminWorkspace({ registry: activeRegistry, requestedLocale }),
        dashboard: migrationReviewDashboard,
        routeMap: {
          total: routeMap.length,
          reviewRequired: routeMap.filter((route) => route.review_required).length,
          mappedListings: routeMap.filter((route) => route.url_type === "listing" && route.target_path).length,
          pendingSample: routeMap.filter((route) => route.review_required).slice(0, 20),
        },
        redirectApprovals: approvals,
        deployablePreview: buildDeployableRedirects(routeMap, approvals),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const input = JSON.parse(request.body || "{}");
        const approval = appendRedirectApproval(routeMap, input, {
          filePath: redirectApprovalPath || undefined,
          approvedAt: reviewedAt,
        });
        const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
        return json(201, {
          approval,
          deployablePreview: buildDeployableRedirects(routeMap, approvals),
        });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/locales") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const result = addLocaleToRegistry(activeRegistry, JSON.parse(request.body || "{}"));
        activeRegistry = result.registry;
        if (localeRegistryPath) writeLocaleRegistry(activeRegistry, localeRegistryPath);
        return json(201, {
          locale: result.locale,
          admin_locales: activeRegistry.admin_locales,
          public_indexable_locales: activeRegistry.locales
            .filter((locale) => locale.public_enabled && locale.indexable)
            .map((locale) => locale.code),
        });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/translations/draft") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const task = createTranslationReviewTask(activeRegistry, JSON.parse(request.body || "{}"));
        return json(201, appendTranslationTask(task, { filePath: translationLedgerPath || undefined }));
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/translations/publish") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const input = JSON.parse(request.body || "{}");
        const task = latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)).find((row) => row.id === input.taskId);
        if (!task) throw new Error("Known translation task is required");
        const published = publishApprovedTranslation(activeRegistry, approveTranslationTask(activeRegistry, task, input.reviewer, input.approvedAt));
        return json(201, appendTranslationTask(published, { filePath: translationLedgerPath || undefined }));
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/edit") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const input = JSON.parse(request.body || "{}");
        const result = createListingEdit(seed, input, latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)), editedAt);
        const edit = appendListingEdit(result.edit, { filePath: listingEditLedgerPath || undefined });
        const persistedStaleTranslations = result.staleTranslations
          .filter((translation) => translation.id)
          .map((translation) => appendTranslationTask(translation, { filePath: translationLedgerPath || undefined }));
        return json(201, { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/replies") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const input = JSON.parse(request.body || "{}");
        return json(
          201,
          appendReviewedReply(readLeadLedger(leadLedgerPath || undefined), input, {
            filePath: replyOutboxPath || undefined,
            reviewedAt,
          }),
        );
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const input = JSON.parse(request.body || "{}");
        return json(
          201,
          appendViewing(readLeadLedger(leadLedgerPath || undefined), input, {
            filePath: viewingLedgerPath || undefined,
            bookedAt,
          }),
        );
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/broker-contacts") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      try {
        const contact = createBrokerContact(JSON.parse(request.body || "{}"), { reviewedAt });
        return json(201, appendBrokerContact(contact, { filePath: brokerContactLedgerPath || undefined }));
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      try {
        const input = JSON.parse(request.body || "{}");
        const lead = submitRuntimeLead(activeRegistry, seed, input);
        const ledger = leadLedgerPath ? appendLead(lead, { filePath: leadLedgerPath, receivedAt }) : null;
        const sellerPipeline =
          sellerPipelinePath && lead.lead?.leadType === "seller"
            ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: sellerPipelineCreatedAt }), {
                filePath: sellerPipelinePath,
              })
            : null;
        return json(201, { ...lead, ledger, sellerPipeline });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/language-requests") {
      try {
        const input = JSON.parse(request.body || "{}");
        const requestRow = createLanguageRequest(activeRegistry, input, requestedAt);
        const ledger = languageRequestPath ? appendLanguageRequest(requestRow, { filePath: languageRequestPath }) : null;
        return json(201, { ...requestRow, ledger });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      try {
        const input = JSON.parse(request.body || "{}");
        const filters = searchFiltersFromObject(input.filters);
        const search = searchRuntimeListings(activeRegistry, seed, {
          localeCode: input.locale || activeRegistry.source_locale,
          query: input.query || "",
          filters,
          translationTasks: readTranslationLedger(translationLedgerPath || undefined),
        });
        const savedSearch = createSavedSearch(activeRegistry, { ...input, filters }, { matchCount: search.search.total_matches, savedAt });
        const ledger = savedSearchLedgerPath ? appendSavedSearch(savedSearch, { filePath: savedSearchLedgerPath }) : null;
        return json(201, { ...savedSearch, ledger });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    const rendered = renderRuntimePath(
      activeRegistry,
      seed,
      url.pathname,
      readTranslationLedger(translationLedgerPath || undefined),
      readBrokerContacts(brokerContactLedgerPath || undefined),
    );
    return publicResponse(request, url, rendered);
  };
}

export async function dispatchHttp(app, { method = "GET", url, body, headers } = {}) {
  return app({ method, url, headers, body: body ? JSON.stringify(body) : "" });
}

export function assertHttpSmoke(smoke) {
  if (smoke.legacyRedirect.status !== 301 || smoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
    throw new Error("HTTP smoke must serve approved legacy redirect");
  }
  if (
    smoke.home.status !== 200 ||
    smoke.home.body.kind !== "home" ||
    smoke.home.body.body.search.path !== "/he/search" ||
    smoke.home.body.body.seller.path !== "/he/sell"
  ) {
    throw new Error("HTTP smoke must serve locale homepage with search and seller paths");
  }
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") {
    throw new Error("HTTP smoke must serve Hebrew listing as RTL 200");
  }
  if (
    smoke.listing.body.body.actions?.primary?.find((action) => action.id === "callback")?.payload.source !==
      "website_callback_request" ||
    smoke.listing.body.body.actions?.direct_contact?.review_status !== "needs_broker_contact_review" ||
    smoke.listing.body.body.actions?.secondary?.find((action) => action.id === "print")?.pdf_status !== "browser_print_ready"
  ) {
    throw new Error("HTTP smoke must expose listing conversion actions without inventing broker contact data");
  }
  if (smoke.brokerContact?.status !== 201 || smoke.brokerContact.body.channels?.phone !== "tel:+359880000000") {
    throw new Error("HTTP smoke must approve broker contact data");
  }
  if (
    smoke.listingAfterBrokerContact?.status !== 200 ||
    smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status !== "approved_broker_contact" ||
    !smoke.listingAfterBrokerContact.body.body.actions.direct_contact.channels.every((channel) => channel.enabled && channel.href)
  ) {
    throw new Error("HTTP smoke must expose approved direct contact links");
  }
  if (smoke.search.status !== 200 || smoke.search.body.mobile_policy.list_first_mobile !== true) {
    throw new Error("HTTP smoke must serve mobile-first search");
  }
  if (smoke.search.body.search.total_matches <= smoke.search.body.cards.length) {
    throw new Error("HTTP smoke must filter search before paginating cards");
  }
  if (
    smoke.location.status !== 200 ||
    smoke.location.body.kind !== "location" ||
    smoke.location.body.body.location !== "Sandanski" ||
    smoke.location.body.cards.some((card) => card.translation_indexable !== true)
  ) {
    throw new Error("HTTP smoke must serve reviewed location inventory pages");
  }
  if (
    smoke.searchFiltered.status !== 200 ||
    smoke.searchFiltered.body.search.filters.property_type !== "apartment" ||
    !smoke.searchFiltered.body.cards.every((card) => card.property_type === "apartment")
  ) {
    throw new Error("HTTP smoke must apply search query-string filters");
  }
  if (smoke.lead.status !== 201 || smoke.lead.body.admin_locale !== "en") {
    throw new Error("HTTP smoke must accept Hebrew lead into EN admin queue");
  }
  if (smoke.lead.body.contact_preference !== "whatsapp") {
    throw new Error("HTTP smoke must preserve lead contact preference");
  }
  if (
    smoke.viewingLead.status !== 201 ||
    smoke.viewingLead.body.lead.source !== "website_viewing_request" ||
    smoke.viewingLead.body.contact_preference !== "phone" ||
    smoke.viewingLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("HTTP smoke must accept public viewing request leads into the gated CRM flow");
  }
  if (smoke.sellerLead.status !== 201 || smoke.sellerLead.body.lead.leadType !== "seller") {
    throw new Error("HTTP smoke must accept seller valuation lead");
  }
  if (smoke.sellerLead.body.sellerPipeline?.stage !== "valuation_requested") {
    throw new Error("HTTP smoke must create seller valuation pipeline row");
  }
  if (
    smoke.contact?.status !== 200 ||
    smoke.contact.body.kind !== "contact" ||
    smoke.contact.body.body.callback.payload.source !== "website_contact_callback"
  ) {
    throw new Error("HTTP smoke must serve generic contact callback page");
  }
  if (
    smoke.contactLead?.status !== 201 ||
    smoke.contactLead.body.lead.source !== "website_contact_callback" ||
    smoke.contactLead.body.lead.leadType !== "general" ||
    smoke.contactLead.body.contact_preference !== "phone" ||
    smoke.contactLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("HTTP smoke must accept contact callback leads into the gated CRM flow");
  }
  if (smoke.fallback.status !== 200 || smoke.fallback.body.indexable !== false) {
    throw new Error("HTTP smoke must serve non-indexable fallback");
  }
  if (smoke.languageRequest.status !== 201 || smoke.languageRequest.body.public_indexable !== false) {
    throw new Error("HTTP smoke must store non-indexable language request");
  }
  if (smoke.savedSearch.status !== 201 || smoke.savedSearch.body.alert_task?.status !== "open") {
    throw new Error("HTTP smoke must store saved search alert tasks");
  }
  if (smoke.savedSearch.body.match_count <= 12) {
    throw new Error("HTTP smoke must store full saved-search match count");
  }
  if (smoke.savedSearch.body.filters?.unsupported_filter) {
    throw new Error("HTTP smoke must ignore unsupported saved-search filters");
  }
  if (
    smoke.localeCreate.status !== 201 ||
    smoke.localeCreate.body.locale.code !== "es" ||
    smoke.localeCreate.body.locale.indexable !== false ||
    JSON.stringify(smoke.localeCreate.body.admin_locales) !== JSON.stringify(["bg", "ru", "en"])
  ) {
    throw new Error("HTTP smoke must add non-indexable website locale without changing admin locales");
  }
  if (smoke.localeFallback.status !== 200 || smoke.localeFallback.body.locale !== "en" || smoke.localeFallback.body.indexable !== false) {
    throw new Error("HTTP smoke must keep new locale fallback non-indexable");
  }
  if (smoke.translationDraft.status !== 201 || smoke.translationDraft.body.public_indexable !== false) {
    throw new Error("HTTP smoke must store non-indexable Hermes translation draft");
  }
  if (smoke.translationPublish.status !== 201 || smoke.translationPublish.body.public_indexable !== true) {
    throw new Error("HTTP smoke must publish only human-approved translation");
  }
  if (smoke.listingEdit.status !== 201 || smoke.listingEdit.body.edit.stale_translation_count < 1) {
    throw new Error("HTTP smoke must stale dependent translations after listing edit");
  }
  if (smoke.staleListing.status !== 200 || smoke.staleListing.body.indexable !== false) {
    throw new Error("HTTP smoke must noindex stale public translation");
  }
  const staleSearchCard = smoke.staleSearch.body.cards.find((card) => card.id === "MS-CRAWL-0001");
  if (
    smoke.staleSearch.status !== 200 ||
    staleSearchCard?.translation_display !== "stale_translation_fallback" ||
    staleSearchCard?.translation_indexable !== false
  ) {
    throw new Error("HTTP smoke must mark stale search cards as fallback");
  }
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("HTTP smoke must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("HTTP smoke must serve robots");
  if (
    smoke.homeHtml?.status !== 200 ||
    !smoke.homeHtml.body.includes("data-kind=\"home\"") ||
    !smoke.homeHtml.body.includes("role=\"search\"")
  ) {
    throw new Error("HTTP smoke must serve rendered homepage HTML");
  }
  if (
    smoke.listingHtml?.status !== 200 ||
    smoke.listingHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingHtml.body.includes("<html lang=\"he\" dir=\"rtl\">") ||
    !smoke.listingHtml.body.includes("data-kind=\"listing\"") ||
    smoke.listingHtml.body.includes("tel:+359880000000")
  ) {
    throw new Error("HTTP smoke must serve rendered listing HTML without unapproved direct contact");
  }
  if (
    smoke.listingPrint?.status !== 200 ||
    smoke.listingPrint.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingPrint.body.includes("data-kind=\"listing-print\"") ||
    !smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\"") ||
    smoke.listingPrint.body.includes("tel:+359880000000")
  ) {
    throw new Error("HTTP smoke must serve browser-print listing HTML without unapproved direct contact");
  }
  if (
    smoke.searchHtml?.status !== 200 ||
    !smoke.searchHtml.body.includes("data-kind=\"search\"") ||
    !smoke.searchHtml.body.includes("data-total-matches=")
  ) {
    throw new Error("HTTP smoke must serve rendered search HTML");
  }
  if (smoke.locationHtml?.status !== 200 || !smoke.locationHtml.body.includes("data-kind=\"location\"")) {
    throw new Error("HTTP smoke must serve rendered location HTML");
  }
  if (
    smoke.sellerPage?.status !== 200 ||
    smoke.sellerPage.body.body.valuation.payload.source !== "website_seller_valuation" ||
    smoke.sellerPage.body.dir !== "rtl"
  ) {
    throw new Error("HTTP smoke must serve seller valuation page");
  }
  if (smoke.sellerHtml?.status !== 200 || !smoke.sellerHtml.body.includes("data-lead-type=\"seller\"")) {
    throw new Error("HTTP smoke must serve rendered seller valuation HTML");
  }
  if (
    smoke.contactHtml?.status !== 200 ||
    !smoke.contactHtml.body.includes("data-kind=\"contact\"") ||
    !smoke.contactHtml.body.includes("data-lead-type=\"general\"")
  ) {
    throw new Error("HTTP smoke must serve rendered contact callback HTML");
  }
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("HTTP smoke must serve RU admin leads");
  if (smoke.admin.body.leads.length < 4) throw new Error("HTTP smoke must show buyer, viewing, contact, and seller leads");
  if (
    smoke.adminMigrationReview?.status !== 200 ||
    smoke.adminMigrationReview.body.workspace.locale !== "bg" ||
    smoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows !== 11859 ||
    smoke.adminMigrationReview.body.routeMap.total !== 457 ||
    smoke.adminMigrationReview.body.routeMap.mappedListings !== 165
  ) {
    throw new Error("HTTP smoke must serve admin migration review workbench contract");
  }
  if (smoke.adminUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("HTTP smoke must queue broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated replies");
  if (smoke.viewing.status !== 201 || smoke.viewing.body.follow_up_task?.status !== "open") {
    throw new Error("HTTP smoke must book viewing follow-up tasks");
  }
  if (smoke.viewingUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated viewings");
  if (
    smoke.viewingCalendar?.status !== 200 ||
    smoke.viewingCalendar.headers["content-type"] !== "text/calendar; charset=utf-8" ||
    !smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR") ||
    !smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z")
  ) {
    throw new Error("HTTP smoke must export broker viewings as an admin calendar feed");
  }
  if (smoke.viewingCalendarUnauthorized?.status !== 401) {
    throw new Error("HTTP smoke must reject unauthenticated viewing calendar export");
  }
  return true;
}
