import http from "node:http";
import { createHttpApp } from "./http.mjs";

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

async function readBody(req, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createNodeServer(app = createHttpApp(), { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const response = await app({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: await readBody(req, maxBodyBytes),
      });
      res.writeHead(response.status, response.headers);
      res.end(typeof response.body === "string" ? response.body : JSON.stringify(response.body));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ kind: status === 413 ? "request_too_large" : "server_error" }));
    }
  });
}

export function listen(server, port = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server.address()));
  });
}

export function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function jsonFetch(baseUrl, path, options = {}) {
  const { captureHeaders = false, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...fetchOptions,
    headers: {
      "content-type": "application/json",
      ...(fetchOptions.headers || {}),
    },
  });
  const result = {
    status: response.status,
    body: await response.json(),
  };
  if (captureHeaders) result.headers = Object.fromEntries(response.headers.entries());
  return result;
}

export async function textFetch(baseUrl, path, options = {}) {
  const { captureHeaders = false, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, fetchOptions);
  const result = {
    status: response.status,
    body: await response.text(),
  };
  if (captureHeaders) result.headers = Object.fromEntries(response.headers.entries());
  return result;
}

export function assertServerSmoke(smoke) {
  if (
    smoke.health?.status !== 200 ||
    smoke.health.body.status !== "ok" ||
    JSON.stringify(smoke.health.body.blockers) !== JSON.stringify(["redirect_reviews", "external_seo_exports"])
  ) {
    throw new Error("Server must expose liveness without hiding launch blockers");
  }
  if (smoke.legacyRedirect.status !== 301 || smoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
    throw new Error("Server must serve approved legacy redirect");
  }
  if (
    smoke.home.status !== 200 ||
    smoke.home.body.kind !== "home" ||
    smoke.home.body.body.search.path !== "/he/search" ||
    smoke.home.body.body.seller.path !== "/he/sell"
  ) {
    throw new Error("Server must serve locale homepage with search and seller paths");
  }
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") throw new Error("Server must serve Hebrew listing");
  if (
    smoke.listing.body.body.actions?.primary?.find((action) => action.id === "callback")?.payload.source !==
    "website_callback_request"
  ) {
    throw new Error("Server must expose listing callback action");
  }
  if (smoke.listing.body.body.actions?.secondary?.find((action) => action.id === "print")?.pdf_status !== "browser_print_ready") {
    throw new Error("Server must expose browser-print listing action");
  }
  if (smoke.brokerContact?.status !== 201 || smoke.brokerContact.body.channels?.phone !== "tel:+359880000000") {
    throw new Error("Server must approve broker contact data");
  }
  if (smoke.listingAfterBrokerContact?.body.body.actions.direct_contact.review_status !== "approved_broker_contact") {
    throw new Error("Server must expose approved direct contact links");
  }
  if (smoke.tourApproval?.status !== 201 || smoke.tourApproval.body.is_public !== true) {
    throw new Error("Server must approve reviewed 360 tour media");
  }
  if (
    smoke.listingAfterTourApproval?.status !== 200 ||
    smoke.listingAfterTourApproval.body.body.media.tour.available !== true ||
    smoke.listingAfterTourApproval.body.body.media.tour.mount_target !== "psv-listing-tour"
  ) {
    throw new Error("Server must expose approved public 360 tour");
  }
  if (smoke.search.status !== 200 || smoke.search.body.cards.length === 0) throw new Error("Server must serve search results");
  if (
    smoke.location.status !== 200 ||
    smoke.location.body.kind !== "location" ||
    smoke.location.body.body.location !== "Sandanski" ||
    smoke.location.body.cards.some((card) => card.translation_indexable !== true)
  ) {
    throw new Error("Server must serve reviewed location inventory pages");
  }
  if (smoke.languageRequest.status !== 201 || smoke.languageRequest.body.public_indexable !== false) {
    throw new Error("Server must store non-indexable language request");
  }
  if (smoke.savedSearch.status !== 201 || smoke.savedSearch.body.alert_task?.status !== "open") {
    throw new Error("Server must store saved search alert tasks");
  }
  for (const response of [
    smoke.languageRequest,
    smoke.savedSearch,
    smoke.lead,
    smoke.viewingLead,
    smoke.contactLead,
    smoke.sellerLead,
    smoke.badLead,
  ]) {
    if (response?.headers?.["cache-control"] !== "no-store") throw new Error("Server must mark visitor form responses no-store");
  }
  if (smoke.ctaClick && (smoke.ctaClick.status !== 201 || smoke.ctaClick.body.type !== "cta_click")) {
    throw new Error("Server must accept privacy-safe CTA click events");
  }
  if (smoke.translationDraft.status !== 201 || smoke.translationDraft.body.public_indexable !== false) {
    throw new Error("Server must store non-indexable Hermes translation draft");
  }
  if (smoke.translationPublish.status !== 201 || smoke.translationPublish.body.public_indexable !== true) {
    throw new Error("Server must publish only human-approved translation");
  }
  if (smoke.listingEdit.status !== 201 || smoke.listingEdit.body.edit.stale_translation_count < 1) {
    throw new Error("Server must stale dependent translations after listing edit");
  }
  if (smoke.staleListing.status !== 200 || smoke.staleListing.body.indexable !== false) {
    throw new Error("Server must noindex stale public translation");
  }
  const staleSearchCard = smoke.staleSearch.body.cards.find((card) => card.id === "MS-CRAWL-0001");
  if (
    smoke.staleSearch.status !== 200 ||
    staleSearchCard?.translation_display !== "stale_translation_fallback" ||
    staleSearchCard?.translation_indexable !== false
  ) {
    throw new Error("Server must mark stale search cards as fallback");
  }
  if (smoke.lead.status !== 201 || smoke.lead.body.admin_locale !== "en") throw new Error("Server must accept lead");
  if (smoke.lead.body.contact_preference !== "whatsapp") throw new Error("Server must preserve lead contact preference");
  if (
    smoke.viewingLead.status !== 201 ||
    smoke.viewingLead.body.lead.source !== "website_viewing_request" ||
    smoke.viewingLead.body.contact_preference !== "phone" ||
    smoke.viewingLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("Server must accept public viewing request leads into the gated CRM flow");
  }
  if (smoke.sellerLead.status !== 201 || smoke.sellerLead.body.lead.leadType !== "seller") {
    throw new Error("Server must accept seller valuation lead");
  }
  if (smoke.sellerLead.body.sellerPipeline?.stage !== "valuation_requested") {
    throw new Error("Server must create seller valuation pipeline row");
  }
  if (
    smoke.contact?.status !== 200 ||
    smoke.contact.body.kind !== "contact" ||
    smoke.contact.body.body.callback.payload.source !== "website_contact_callback"
  ) {
    throw new Error("Server must serve generic contact callback page");
  }
  if (
    smoke.contactLead?.status !== 201 ||
    smoke.contactLead.body.lead.source !== "website_contact_callback" ||
    smoke.contactLead.body.lead.leadType !== "general" ||
    smoke.contactLead.body.contact_preference !== "phone" ||
    smoke.contactLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("Server must accept contact callback leads into the gated CRM flow");
  }
  if (smoke.badLead.status !== 400) throw new Error("Server must reject unknown buyer listing");
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("Server must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("Server must serve robots");
  if (
    smoke.homeHtml?.status !== 200 ||
    !smoke.homeHtml.body.includes("data-kind=\"home\"") ||
    !smoke.homeHtml.body.includes("role=\"search\"")
  ) {
    throw new Error("Server must serve rendered homepage HTML");
  }
  if (
    smoke.listingHtml?.status !== 200 ||
    !smoke.listingHtml.body.includes("<html lang=\"he\" dir=\"rtl\">") ||
    !smoke.listingHtml.body.includes("data-kind=\"listing\"")
  ) {
    throw new Error("Server must serve rendered listing HTML");
  }
  if (
    smoke.listingPrint?.status !== 200 ||
    !smoke.listingPrint.body.includes("data-kind=\"listing-print\"") ||
    !smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\"") ||
    smoke.listingPrint.body.includes("tel:+359880000000")
  ) {
    throw new Error("Server must serve browser-print listing HTML without unapproved direct contact");
  }
  if (smoke.searchHtml?.status !== 200 || !smoke.searchHtml.body.includes("data-kind=\"search\"")) {
    throw new Error("Server must serve rendered search HTML");
  }
  if (smoke.locationHtml?.status !== 200 || !smoke.locationHtml.body.includes("data-kind=\"location\"")) {
    throw new Error("Server must serve rendered location HTML");
  }
  if (
    smoke.sellerPage?.status !== 200 ||
    smoke.sellerPage.body.body.valuation.payload.source !== "website_seller_valuation" ||
    !smoke.sellerHtml?.body.includes("data-lead-type=\"seller\"")
  ) {
    throw new Error("Server must serve seller valuation page");
  }
  if (
    smoke.contactHtml?.status !== 200 ||
    !smoke.contactHtml.body.includes("data-kind=\"contact\"") ||
    !smoke.contactHtml.body.includes("data-lead-type=\"general\"")
  ) {
    throw new Error("Server must serve rendered contact callback HTML");
  }
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("Server must serve RU admin leads");
  if (smoke.admin.body.leads.length < 4) throw new Error("Server must show buyer, viewing, contact, and seller leads");
  if (smoke.adminUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("Server must queue broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated replies");
  if (smoke.viewing.status !== 201 || smoke.viewing.body.follow_up_task?.status !== "open") {
    throw new Error("Server must book viewing follow-up tasks");
  }
  if (smoke.viewingUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated viewings");
  if (
    smoke.viewingCalendar?.status !== 200 ||
    !smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR") ||
    !smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z")
  ) {
    throw new Error("Server must export broker viewings as an admin calendar feed");
  }
  if (smoke.viewingCalendarUnauthorized?.status !== 401) {
    throw new Error("Server must reject unauthenticated viewing calendar export");
  }
  return true;
}
