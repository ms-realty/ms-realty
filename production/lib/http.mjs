import { loadLocaleRegistry } from "./locales.mjs";
import { appendLead, readLeadLedger } from "./lead-ledger.mjs";
import { appendReviewedReply, readReplyOutbox } from "./lead-replies.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";
import { loadLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";

function response(status, body, contentType) {
  return {
    status,
    headers: { "content-type": contentType },
    body,
  };
}

function json(status, body) {
  return response(status, body, "application/json; charset=utf-8");
}

export function createHttpApp({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  leadLedgerPath = null,
  replyOutboxPath = null,
  receivedAt,
  reviewedAt,
} = {}) {
  return async function handle(request) {
    const url = new URL(request.url, "http://localhost");
    const auth = request.headers?.authorization || request.headers?.Authorization || "";

    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      return response(200, renderSitemapXml(loadLocalizedSitemap()), "application/xml; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/robots.txt") {
      return response(200, renderRobotsTxt(), "text/plain; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const localeCode = url.searchParams.get("locale") || "bg";
      const query = url.searchParams.get("q") || "";
      return json(200, searchRuntimeListings(registry, seed, { localeCode, query }));
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      if (auth !== `Bearer ${process.env.MS_REALTY_ADMIN_TOKEN || "local-admin-smoke"}`) {
        return json(401, { kind: "unauthorized" });
      }
      const requestedLocale = url.searchParams.get("locale") || "en";
      return json(200, {
        workspace: renderAdminWorkspace({ registry, requestedLocale }),
        leads: readLeadLedger(leadLedgerPath || undefined),
        replies: readReplyOutbox(replyOutboxPath || undefined),
      });
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

    if (request.method === "POST" && url.pathname === "/api/leads") {
      try {
        const input = JSON.parse(request.body || "{}");
        const lead = submitRuntimeLead(registry, seed, input);
        const ledger = leadLedgerPath ? appendLead(lead, { filePath: leadLedgerPath, receivedAt }) : null;
        return json(201, { ...lead, ledger });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    const rendered = renderRuntimePath(registry, seed, url.pathname);
    return json(rendered.status || 200, rendered);
  };
}

export async function dispatchHttp(app, { method = "GET", url, body, headers } = {}) {
  return app({ method, url, headers, body: body ? JSON.stringify(body) : "" });
}

export function assertHttpSmoke(smoke) {
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") {
    throw new Error("HTTP smoke must serve Hebrew listing as RTL 200");
  }
  if (smoke.search.status !== 200 || smoke.search.body.mobile_policy.list_first_mobile !== true) {
    throw new Error("HTTP smoke must serve mobile-first search");
  }
  if (smoke.lead.status !== 201 || smoke.lead.body.admin_locale !== "en") {
    throw new Error("HTTP smoke must accept Hebrew lead into EN admin queue");
  }
  if (smoke.sellerLead.status !== 201 || smoke.sellerLead.body.lead.leadType !== "seller") {
    throw new Error("HTTP smoke must accept seller valuation lead");
  }
  if (smoke.fallback.status !== 200 || smoke.fallback.body.indexable !== false) {
    throw new Error("HTTP smoke must serve non-indexable fallback");
  }
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("HTTP smoke must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("HTTP smoke must serve robots");
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("HTTP smoke must serve RU admin leads");
  if (smoke.admin.body.leads.length < 2) throw new Error("HTTP smoke must show buyer and seller leads");
  if (smoke.adminUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("HTTP smoke must queue broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated replies");
  return true;
}
