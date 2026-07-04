import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";

function json(status, body) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

export function createHttpApp({ registry = loadLocaleRegistry(), seed = loadCmsSeed() } = {}) {
  return async function handle(request) {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/search") {
      const localeCode = url.searchParams.get("locale") || "bg";
      const query = url.searchParams.get("q") || "";
      return json(200, searchRuntimeListings(registry, seed, { localeCode, query }));
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      try {
        const input = JSON.parse(request.body || "{}");
        return json(201, submitRuntimeLead(registry, seed, input));
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    const rendered = renderRuntimePath(registry, seed, url.pathname);
    return json(rendered.status || 200, rendered);
  };
}

export async function dispatchHttp(app, { method = "GET", url, body } = {}) {
  return app({ method, url, body: body ? JSON.stringify(body) : "" });
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
  if (smoke.fallback.status !== 200 || smoke.fallback.body.indexable !== false) {
    throw new Error("HTTP smoke must serve non-indexable fallback");
  }
  return true;
}
