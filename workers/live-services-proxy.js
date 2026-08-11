import { secretMatches } from "./durable-case-authority.mjs";

const MAX_QUERY_BODY_BYTES = 64 * 1024;
const MAX_SYNC_BODY_BYTES = 16 * 1024 * 1024;
const TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TYPESENSE_PUBLIC_FILTER_PREFIX = [
  "publication_state:=published",
  "(listing_status:=available || listing_status:=reserved)",
  "translation_indexable:=true",
  "translation_human_approved:=true",
  "locale_indexable:=true",
].join(" && ") + " && ";
const MEILI_PUBLIC_FILTER_PREFIX = [
  'publication_state = "published"',
  '(listing_status = "available" OR listing_status = "reserved")',
  "translation_indexable = true",
  "translation_human_approved = true",
  "locale_indexable = true",
].join(" AND ") + " AND ";
const TYPESENSE_LOCALE_FILTER = /^(?:locale:=`[A-Za-z0-9-]{1,32}`|\(locale:=`[A-Za-z0-9-]{1,32}`(?: \|\| locale:=`[A-Za-z0-9-]{1,32}`)+\))(?:$| && )/;
const MEILI_LOCALE_FILTER = /^(?:locale = "[A-Za-z0-9-]{1,32}"|\(locale = "[A-Za-z0-9-]{1,32}"(?: OR locale = "[A-Za-z0-9-]{1,32}")+\))(?:$| AND )/;

function response(status, message) {
  return new Response(message, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" },
  });
}

function configuration(env) {
  const engine = String(env.MS_REALTY_SEARCH_ENGINE || "").trim().toLowerCase();
  const target = String(env.MS_REALTY_SEARCH_TARGET || "").trim();
  const originToken = String(env.MS_REALTY_SEARCH_ORIGIN_TOKEN || "").trim();
  const queryKey = String(env.MS_REALTY_SEARCH_QUERY_PROXY_KEY || "").trim();
  const syncKey = String(env.MS_REALTY_SEARCH_SYNC_PROXY_KEY || "").trim();
  let origin;
  try {
    origin = new URL(String(env.MS_REALTY_SEARCH_ORIGIN || ""));
  } catch {
    throw new Error("search origin is invalid");
  }
  if (!["typesense", "meilisearch"].includes(engine) || !TARGET_PATTERN.test(target)) throw new Error("search target is invalid");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("search origin must be an exact HTTPS origin");
  }
  if ([originToken, queryKey, syncKey].some((value) => value.length < 32)) throw new Error("search proxy secrets are incomplete");
  return { engine, origin, originToken, queryKey, syncKey, target };
}

function presentedCredential(request, engine) {
  if (engine === "typesense") return String(request.headers.get("x-typesense-api-key") || "").trim();
  return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function credentialMatches(presented, expected) {
  return Boolean(presented && expected) && secretMatches(presented, expected);
}

function exactSearchParams(url, expected) {
  const entries = [...url.searchParams.entries()];
  return entries.length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
}

async function boundedBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("request body is too large");
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw new Error("request body is too large");
  return body;
}

function validFilterSyntax(filter) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < filter.length; index += 1) {
    const character = filter[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(character)) quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth < 0) return false;
    } else if (depth === 0 && filter.startsWith("||", index)) return false;
    else if (
      depth === 0 &&
      filter.slice(index, index + 2).toUpperCase() === "OR" &&
      !/[A-Za-z0-9_]/.test(filter[index - 1] || "") &&
      !/[A-Za-z0-9_]/.test(filter[index + 2] || "")
    ) return false;
  }
  return depth === 0 && quote === null;
}

function mandatoryFilter(value, prefix, localePattern) {
  if (typeof value !== "string" || value.length > 8_192 || !value.startsWith(prefix)) return false;
  return localePattern.test(value.slice(prefix.length)) && validFilterSyntax(value);
}

async function typesenseRoute(request, url, target) {
  if (request.method === "GET" && url.pathname === "/health" && !url.search) return { access: "health" };
  if (request.method === "GET" && url.pathname === `/collections/${target}/documents/search`) {
    if (
      !url.searchParams.get("q") ||
      !url.searchParams.get("query_by") ||
      url.searchParams.getAll("filter_by").length !== 1 ||
      !mandatoryFilter(url.searchParams.get("filter_by"), TYPESENSE_PUBLIC_FILTER_PREFIX, TYPESENSE_LOCALE_FILTER) ||
      Number(url.searchParams.get("per_page") || 0) < 1 ||
      Number(url.searchParams.get("per_page")) > 250
    ) {
      throw new Error("public search filter is invalid");
    }
    return { access: "query" };
  }
  if (request.method === "POST" && url.pathname === "/collections" && !url.search) {
    const body = await boundedBody(request, MAX_QUERY_BODY_BYTES);
    let schema;
    try {
      schema = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new Error("collection schema is invalid");
    }
    if (schema?.name !== target) throw new Error("collection target is invalid");
    return { access: "sync", body };
  }
  if (
    request.method === "POST" &&
    url.pathname === `/collections/${target}/documents/import` &&
    exactSearchParams(url, { action: "upsert" })
  ) {
    return { access: "sync", body: await boundedBody(request, MAX_SYNC_BODY_BYTES) };
  }
  return null;
}

async function meilisearchRoute(request, url, target) {
  if (request.method === "GET" && url.pathname === "/health" && !url.search) return { access: "health" };
  if (request.method === "POST" && url.pathname === `/indexes/${target}/search` && !url.search) {
    const body = await boundedBody(request, MAX_QUERY_BODY_BYTES);
    let query;
    try {
      query = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new Error("search query is invalid");
    }
    if (!mandatoryFilter(query?.filter, MEILI_PUBLIC_FILTER_PREFIX, MEILI_LOCALE_FILTER) || !Number.isInteger(query?.limit) || query.limit < 1 || query.limit > 250) {
      throw new Error("public search filter is invalid");
    }
    return { access: "query", body };
  }
  if (request.method === "PATCH" && url.pathname === `/indexes/${target}/settings` && !url.search) {
    return { access: "sync", body: await boundedBody(request, MAX_QUERY_BODY_BYTES) };
  }
  if (
    request.method === "POST" &&
    url.pathname === `/indexes/${target}/documents` &&
    exactSearchParams(url, { primaryKey: "meili_id" })
  ) {
    return { access: "sync", body: await boundedBody(request, MAX_SYNC_BODY_BYTES) };
  }
  return null;
}

async function authorized(request, config, access) {
  const presented = presentedCredential(request, config.engine);
  if (access === "query") return credentialMatches(presented, config.queryKey);
  if (access === "sync") return credentialMatches(presented, config.syncKey);
  return (await credentialMatches(presented, config.queryKey)) || credentialMatches(presented, config.syncKey);
}

async function proxy(request, config, url, route, fetchImpl) {
  const upstream = new URL(`/_search/${config.engine}${url.pathname}${url.search}`, config.origin);
  const headers = new Headers({ "x-ms-realty-search-origin-token": config.originToken });
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(upstream.href, {
      method: request.method,
      headers,
      redirect: "manual",
      ...(request.method === "GET" ? {} : { body: route.body ?? (await boundedBody(request, MAX_SYNC_BODY_BYTES)) }),
    });
  } catch {
    return response(502, "Search origin unavailable");
  }
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) return response(502, "Search origin redirect rejected");
  const responseHeaders = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  for (const name of ["content-type", "content-length"]) {
    const value = upstreamResponse.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstreamResponse.body, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers: responseHeaders });
}

export default {
  async fetch(request, env, context = {}) {
    let config;
    try {
      config = configuration(env);
    } catch {
      return response(503, "Search proxy unavailable");
    }
    const url = new URL(request.url);
    let route;
    try {
      route = config.engine === "typesense"
        ? await typesenseRoute(request, url, config.target)
        : await meilisearchRoute(request, url, config.target);
    } catch (error) {
      return response(400, error.message);
    }
    if (!route) return response(404, "Not found");
    if (!(await authorized(request, config, route.access))) return response(401, "Unauthorized");
    return proxy(request, config, url, route, context.fetchImpl || globalThis.fetch);
  },
};
