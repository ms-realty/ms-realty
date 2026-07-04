import http from "node:http";
import { createHttpApp } from "./http.mjs";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function createNodeServer(app = createHttpApp()) {
  return http.createServer(async (req, res) => {
    const response = await app({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: await readBody(req),
    });
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
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
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
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
  if (smoke.legacyRedirect.status !== 301 || smoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
    throw new Error("Server must serve approved legacy redirect");
  }
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") throw new Error("Server must serve Hebrew listing");
  if (smoke.search.status !== 200 || smoke.search.body.cards.length === 0) throw new Error("Server must serve search results");
  if (smoke.languageRequest.status !== 201 || smoke.languageRequest.body.public_indexable !== false) {
    throw new Error("Server must store non-indexable language request");
  }
  if (smoke.savedSearch.status !== 201 || smoke.savedSearch.body.alert_task?.status !== "open") {
    throw new Error("Server must store saved search alert tasks");
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
  if (smoke.sellerLead.status !== 201 || smoke.sellerLead.body.lead.leadType !== "seller") {
    throw new Error("Server must accept seller valuation lead");
  }
  if (smoke.badLead.status !== 400) throw new Error("Server must reject unknown buyer listing");
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("Server must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("Server must serve robots");
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("Server must serve RU admin leads");
  if (smoke.admin.body.leads.length < 2) throw new Error("Server must show buyer and seller leads");
  if (smoke.adminUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("Server must queue broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated replies");
  if (smoke.viewing.status !== 201 || smoke.viewing.body.follow_up_task?.status !== "open") {
    throw new Error("Server must book viewing follow-up tasks");
  }
  if (smoke.viewingUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated viewings");
  return true;
}
