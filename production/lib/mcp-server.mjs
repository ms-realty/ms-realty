import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "./app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "./app-api-adapter.mjs";
import { canAdminAccess, canAdminMutate, normalizedRoles, operatorId, resolveAdminPrincipal } from "./admin-auth.mjs";
import { adminSessionFingerprint } from "./admin-sessions.mjs";
import { resolveOperatorAgentPrincipal } from "./operator-agent-access.mjs";
import { applyListingEdits, LISTING_STATUSES, readListingEdits } from "./listing-edits.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
import {
  ADMIN_ROUTE_COVERAGE,
  HERMES_TOOL_COVERAGE,
  OWNER_OPERATOR_ADMIN_READ_TOOL,
  OWNER_OPERATOR_ADMIN_WRITE_TOOL,
  OWNER_OPERATOR_CONTEXT_TOOL,
  OWNER_OPERATOR_HERMES_TOOL,
  ownerOperatorConfirmation,
  ownerOperatorOperationById,
  validateOwnerOperatorInput,
} from "./owner-operator-catalog.mjs";
import {
  issueOperatorChallenge,
  operatorChallengeSecret,
  verifyOperatorChallenge,
} from "./operator-challenge.mjs";
import { BRIDGE_GUARDRAILS, bridgeNextTasks, bridgeStatus, bridgeSubmitDraft } from "./hermes-desktop-bridge.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings } from "./runtime.mjs";
import { listingPath } from "./seo.mjs";
import { readTourApprovals } from "./tours.mjs";
import { readTranslationLedger } from "./translation-ledger.mjs";

const DEFAULT_ALLOWED_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com"];
const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const LOCALE = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).max(10);
const LISTING_ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/).max(80);
const TEXT = (max) => z.string().trim().max(max);
const LISTING_STATUS = z.enum(LISTING_STATUSES);
const OWNER_OPERATOR_QUERY_VALUE = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string().max(20_000), z.number().finite(), z.boolean()])).max(100),
]);
const OWNER_OPERATOR_QUERY = z.record(z.string(), OWNER_OPERATOR_QUERY_VALUE).optional();
const OWNER_OPERATOR_BODY = z.record(z.string(), z.unknown()).optional();
const OIDC_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"];
const OIDC_ENV = {
  issuer: "MS_REALTY_MCP_OIDC_ISSUER",
  audience: "MS_REALTY_MCP_OIDC_AUDIENCE",
  jwks: "MS_REALTY_MCP_OIDC_JWKS_URL",
  principals: "MS_REALTY_MCP_OIDC_PRINCIPALS_JSON",
};

function configuredOrigins(value) {
  const origins = new Set(DEFAULT_ALLOWED_ORIGINS);
  for (const candidate of String(value || "").split(",")) {
    const origin = candidate.trim();
    if (!origin) continue;
    try {
      origins.add(new URL(origin).origin);
    } catch {
      throw new Error("MS_REALTY_MCP_ALLOWED_ORIGINS must contain valid origins");
    }
  }
  return origins;
}

function configuredUrl(value, label, { requireHttps = true } = {}) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} must not contain credentials, query, or fragment`);
  if (requireHttps && url.protocol !== "https:") throw new Error(`${label} must use https`);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error(`${label} must use http or https`);
  return url;
}

function configuredOidcPrincipals(value) {
  let rows;
  try {
    rows = JSON.parse(String(value || ""));
  } catch {
    throw new Error(`${OIDC_ENV.principals} must be valid JSON`);
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${OIDC_ENV.principals} must be a non-empty array`);
  const subjects = new Set();
  const operatorIds = new Set();
  const principals = new Map();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${OIDC_ENV.principals} entry ${index + 1} must be an object`);
    }
    const subject = String(row.subject || "").trim();
    if (!subject || subject.length > 255) throw new Error(`${OIDC_ENV.principals} entry ${index + 1} subject is required`);
    const id = operatorId(row.id, `${OIDC_ENV.principals} entry ${index + 1} id`);
    const roles = normalizedRoles(row.roles, `${OIDC_ENV.principals} entry ${index + 1} roles`);
    if (subjects.has(subject)) throw new Error(`${OIDC_ENV.principals} subjects must be unique`);
    if (operatorIds.has(id)) throw new Error(`${OIDC_ENV.principals} operator IDs must be unique`);
    subjects.add(subject);
    operatorIds.add(id);
    principals.set(subject, { id, roles });
  });
  return principals;
}

export function mcpOidcConfigFromEnv(env = process.env) {
  const values = Object.values(OIDC_ENV).map((name) => String(env[name] || "").trim());
  if (values.every((value) => !value)) return null;
  const missing = Object.values(OIDC_ENV).filter((name) => !String(env[name] || "").trim());
  if (missing.length) throw new Error(`MCP OIDC configuration is incomplete: ${missing.join(", ")}`);
  const requireHttps = env.NODE_ENV === "production";
  const issuerUrl = configuredUrl(env[OIDC_ENV.issuer], OIDC_ENV.issuer, { requireHttps });
  const jwksUrl = configuredUrl(env[OIDC_ENV.jwks], OIDC_ENV.jwks, { requireHttps });
  const issuer = issuerUrl.href.replace(/\/$/, "");
  const audience = String(env[OIDC_ENV.audience]).trim();
  if (!audience || audience.length > 240 || /\s/.test(audience)) throw new Error(`${OIDC_ENV.audience} must be a non-empty audience value`);
  const scope = String(env.MS_REALTY_MCP_OIDC_SCOPE || "ms-realty:operator").trim();
  if (!scope || scope.length > 120 || /\s/.test(scope)) throw new Error("MS_REALTY_MCP_OIDC_SCOPE must contain one OAuth scope");
  const jwks = createRemoteJWKSet(jwksUrl);
  return {
    issuer,
    audience,
    jwksUrl: jwksUrl.href,
    scope,
    principals: configuredOidcPrincipals(env[OIDC_ENV.principals]),
    verify: (token) => jwtVerify(token, jwks, { issuer, audience, algorithms: OIDC_ALGORITHMS }),
  };
}

export function mcpConfigFromEnv(env = process.env) {
  const oidc = mcpOidcConfigFromEnv(env);
  const publicOriginValue = String(env.MS_REALTY_PUBLIC_ORIGIN || "").trim();
  const publicOrigin = publicOriginValue
    ? configuredUrl(publicOriginValue, "MS_REALTY_PUBLIC_ORIGIN", { requireHttps: env.NODE_ENV === "production" }).origin
    : null;
  if (oidc && env.NODE_ENV === "production" && !publicOrigin) {
    throw new Error("MS_REALTY_PUBLIC_ORIGIN is required for production MCP OIDC");
  }
  return {
    env,
    apiConfig: appApiConfigFromEnv(env),
    adminConfig: { ...appAdminConfigFromEnv(env), authEnv: env },
    allowedOrigins: configuredOrigins(env.MS_REALTY_MCP_ALLOWED_ORIGINS),
    oidc,
    publicOrigin,
    // On runtimes with ephemeral disks (the Cloudflare Container) ledger
    // writes would be silently lost, so the Worker sets this flag and the
    // write tools are simply not registered — tools/list stays truthful.
    writesDisabled: String(env.MS_REALTY_MCP_WRITES_DISABLED || "").trim() === "1",
    durableListingWritesEnabled: String(env.MS_REALTY_MCP_DURABLE_LISTING_WRITES || "").trim() === "1",
  };
}

function mcpResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...headers },
  });
}

function secured(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function publicMcpOrigin(request, config) {
  return config.publicOrigin || new URL(request.url).origin;
}

function protectedResourceMetadataUrl(request, config) {
  return new URL("/.well-known/oauth-protected-resource/mcp", publicMcpOrigin(request, config)).href;
}

function mcpUnauthorized(request, config) {
  const parameters = ['realm="ms-realty-mcp"'];
  if (config.oidc) {
    parameters.push(`resource_metadata="${protectedResourceMetadataUrl(request, config)}"`);
    parameters.push(`scope="${config.oidc.scope}"`);
  }
  return mcpResponse(
    401,
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    { "www-authenticate": `Bearer ${parameters.join(", ")}` },
  );
}

function tokenScopes(payload) {
  const values = [];
  if (typeof payload?.scope === "string") values.push(...payload.scope.split(/\s+/));
  if (typeof payload?.scp === "string") values.push(...payload.scp.split(/\s+/));
  if (Array.isArray(payload?.scp)) values.push(...payload.scp);
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
}

async function resolveMcpPrincipal(authHeader, config) {
  const registered = resolveAdminPrincipal(authHeader, config.env);
  if (registered) return registered;
  // The capability an operator handed to their own desktop AI from
  // /admin/connect. It is a delegation, not an escalation: it carries the
  // minting operator's roles and nothing more, it expires on its own, and
  // rotating MS_REALTY_OPERATOR_AGENT_TOKEN_SECRET withdraws every one of them
  // at once. Without that secret configured no such token is ever accepted.
  // Deliberately scoped to /mcp: the assistant works through the tools, not
  // through the admin REST surface.
  const delegated = resolveOperatorAgentPrincipal(authHeader, config.env);
  if (delegated) return delegated;
  if (!config.oidc || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const verification = await config.oidc.verify(token);
    const payload = verification?.payload || verification;
    if (!tokenScopes(payload).has(config.oidc.scope)) return null;
    const principal = config.oidc.principals.get(String(payload?.sub || ""));
    return principal ? { ...principal, source: "oidc", can_mutate: true } : null;
  } catch {
    return null;
  }
}

export function renderMcpProtectedResourceMetadata(request, { config = mcpConfigFromEnv() } = {}) {
  try {
    if (request.method !== "GET") return mcpResponse(405, { error: "Method not allowed" }, { allow: "GET" });
    if (!config.oidc) return mcpResponse(404, { error: "MCP OAuth protected resource is not configured" });
    const origin = publicMcpOrigin(request, config);
    return mcpResponse(200, {
      resource: new URL("/mcp", origin).href,
      authorization_servers: [config.oidc.issuer],
      scopes_supported: [config.oidc.scope],
      bearer_methods_supported: ["header"],
    });
  } catch {
    return mcpResponse(500, { error: "MCP OAuth protected resource metadata is unavailable" });
  }
}

function rejectUntrustedOrigin(request, config) {
  const submitted = request.headers.get("origin");
  if (!submitted) return null;
  let origin;
  try {
    origin = new URL(submitted).origin;
  } catch {
    return mcpResponse(403, { jsonrpc: "2.0", error: { code: -32003, message: "Forbidden origin" }, id: null });
  }
  return config.allowedOrigins.has(origin)
    ? null
    : mcpResponse(403, { jsonrpc: "2.0", error: { code: -32003, message: "Forbidden origin" }, id: null });
}

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function currentSeed(config) {
  const api = config.apiConfig;
  return applyMediaReviews(
    applyListingEdits(loadCmsSeed(api.cmsSeedPath), readListingEdits(api.listingEditLedgerPath)),
    readMediaReviews(api.mediaReviewLedgerPath),
  );
}

function currentRegistry(config) {
  return loadLocaleRegistry(config.apiConfig.localeRegistryPath);
}

function publicCard(card) {
  return {
    id: card.id,
    title: card.title,
    path: card.path,
    content_locale: card.content_locale,
    location: card.location,
    property_type: card.property_type,
    offer_type: card.offer_type,
    bedrooms: card.bedrooms,
    bedrooms_not_applicable: card.bedrooms_not_applicable === true,
    area_sqm: card.area_sqm,
    price_eur: card.price_eur,
    price_on_request: card.price_on_request === true,
    listing_status: card.listing_status,
    image_count: card.image_count,
    thumbnail: card.thumbnail || null,
  };
}

function publicListing(config, listingId, localeCode) {
  const registry = currentRegistry(config);
  const seed = currentSeed(config);
  const rendered = renderRuntimePath(
    registry,
    seed,
    listingPath(registry, localeCode, listingId),
    readTranslationLedger(config.apiConfig.translationLedgerPath),
    [],
    readTourApprovals(config.adminConfig.tourApprovalLedgerPath),
  );
  if (rendered.status !== 200 || rendered.kind !== "listing") throw new Error("Listing is not publicly available");
  const body = rendered.body;
  return {
    id: body.facts.id,
    path: rendered.path,
    canonical: rendered.canonical,
    locale: rendered.locale,
    content_locale: body.content_locale,
    indexable: rendered.indexable === true,
    title: body.h1,
    description: body.description,
    facts: body.facts,
    lifecycle: body.lifecycle,
    verification: body.verification,
    media: {
      gallery_count: body.media?.gallery_count || 0,
      gallery: (body.media?.gallery || []).slice(0, 24),
      floor_plans: body.media?.floor_plans || [],
      videos: body.media?.videos || [],
      tour: body.media?.tour || null,
    },
  };
}

async function adminJson(config, principal, pathname, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await renderAppAdminResponse(
    new Request(`http://mcp.local${pathname}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    {
      config: {
        ...config.adminConfig,
        adminPrincipal: principal,
        payloadListingRuntime: config.payloadListingRuntime || config.adminConfig.payloadListingRuntime || null,
        requestChannel: "mcp",
      },
    },
  );
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function ownerOperatorPath(row, query = {}) {
  validateOwnerOperatorInput(query);
  const url = new URL(row.pathname, "http://mcp.local");
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  return `${url.pathname}${url.search}`;
}

function hermesSubmitInput({ id, draft, model, target_locale: targetLocale } = {}) {
  return {
    // Keep challenge issuance and verification byte-for-byte aligned. The
    // MCP schema omits optional fields, while the verifier receives the
    // destructured callback values, so both sides normalize them to null.
    id: id || null,
    draft: draft || null,
    model: model || null,
    target_locale: targetLocale || null,
  };
}

const consumedOperatorChallenges = new Map();

function verifyMutationChallenge(confirmation, options) {
  const verified = verifyOperatorChallenge(confirmation, options);
  const now = Math.floor(Date.now() / 1000);
  for (const [key, expiresAt] of consumedOperatorChallenges) {
    if (expiresAt <= now) consumedOperatorChallenges.delete(key);
  }
  const replayKey = `${verified.operator_id}\0${verified.session_id}\0${verified.nonce}`;
  if (consumedOperatorChallenges.has(replayKey)) {
    throw new Error("The operator confirmation challenge has already been used.");
  }
  // ponytail: this is isolate-local because remote writes run on one durable
  // origin; move nonce consumption to shared storage before adding write replicas.
  consumedOperatorChallenges.set(replayKey, verified.exp);
  return verified;
}

function ownerOperatorResult(row, response, payload) {
  return {
    operation: row.operation,
    method: row.method,
    pathname: row.pathname,
    http_status: response.status,
    result: payload,
  };
}

function publicToolDefinitions(server, config) {
  server.registerTool(
    "search_public_listings",
    {
      description: "Search the public MS Realty listing catalogue. Results include only property data already visible on the public website.",
      inputSchema: z
        .object({
          locale: LOCALE.default("bg"),
          query: TEXT(180).default(""),
          location: TEXT(120).optional(),
          municipality: TEXT(120).optional(),
          property_type: TEXT(80).optional(),
          offer_type: TEXT(32).optional(),
          status: TEXT(32).optional(),
          price_min: z.number().nonnegative().optional(),
          price_max: z.number().nonnegative().optional(),
          bedrooms_min: z.number().int().nonnegative().max(20).optional(),
          area_min: z.number().nonnegative().optional(),
          area_max: z.number().nonnegative().optional(),
          sort: z.enum(["recommended", "price_asc", "price_desc"]).default("recommended"),
          page: z.number().int().min(1).max(100).default(1),
          page_size: z.number().int().min(1).max(24).default(12),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ locale, query, sort, page, page_size: pageSize, ...filters }) => {
      try {
        const result = searchRuntimeListings(currentRegistry(config), currentSeed(config), {
          localeCode: locale,
          query,
          filters,
          sort,
          page,
          pageSize,
          translationTasks: readTranslationLedger(config.apiConfig.translationLedgerPath),
        });
        return textResult({
          locale: result.locale,
          path: result.path,
          query: result.search.query,
          filters: result.search.filters,
          pagination: result.search.pagination,
          total_matches: result.search.total_matches,
          listings: result.cards.map(publicCard),
        });
      } catch {
        return errorResult("The public listing search could not be completed.");
      }
    },
  );

  server.registerTool(
    "get_public_listing",
    {
      description: "Read one listing as it is publicly rendered, including only approved public media.",
      inputSchema: z.object({ listing_id: LISTING_ID, locale: LOCALE.default("bg") }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ listing_id: listingId, locale }) => {
      try {
        return textResult(publicListing(config, listingId, locale));
      } catch {
        return errorResult("That listing is not publicly available in the requested locale.");
      }
    },
  );

  server.registerTool(
    "get_launch_status",
    {
      description: "Read the public MS Realty launch-readiness state and its current blockers.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        const response = await renderAppApiResponse(new Request("http://mcp.local/api/ready"), { config: config.apiConfig });
        return textResult({ http_status: response.status, ...(await response.json()) });
      } catch {
        return errorResult("Launch readiness could not be read.");
      }
    },
  );
}

function ownerOperatorToolDefinitions(server, config, principal, sessionId) {
  const available = ADMIN_ROUTE_COVERAGE.filter((row) => canAdminAccess(principal, row.capability));
  const remote = available.filter((row) => row.execution === "mcp_delegated");
  const browser = available.filter((row) => row.execution === "browser_session");
  const reads = remote.filter((row) => row.read_only);
  const writes = remote.filter((row) => !row.read_only);
  const hermesSubmitAvailable =
    !config.writesDisabled && canAdminMutate(principal) && canAdminAccess(principal, "translations:read") && canAdminAccess(principal, "translations:write");

  server.registerTool(
    OWNER_OPERATOR_CONTEXT_TOOL,
    {
      description:
        "List every admin operation this operator may use. For a delegated write, call this tool with challenge_for containing the exact operation input to receive a short-lived signed confirmation.",
      inputSchema: z
        .object({
          challenge_for: z
            .object({
              operation: z.string().trim().min(1).max(200),
              input: OWNER_OPERATOR_BODY,
              query: OWNER_OPERATOR_QUERY,
            })
            .strict()
            .optional(),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ challenge_for: challengeFor }) => {
      const result = {
        operator_id: principal.id,
        roles: principal.roles,
        writes_enabled: !config.writesDisabled,
        summary: { total: available.length, mcp_delegated: remote.length, browser_session: browser.length },
        operations: available.map((row) => ({
          operation: row.operation,
          method: row.method,
          pathname: row.pathname,
          capability: row.capability,
          family: row.family,
          execution: row.execution,
          sensitive: row.sensitive,
          ...(row.read_only ? {} : { confirmation: ownerOperatorConfirmation(row.operation) }),
        })),
        browser_session_note:
          "Open /admin in the ChatGPT/Codex built-in browser for file, secret, connection, team, export, import, and second-factor operations. The signed-in page exposes read/open registry entries through WebMCP; mutations remain signed delegated MCP or human admin forms.",
      };
      if (!challengeFor) return textResult(result);
      try {
        const operation = String(challengeFor.operation);
        const row = ownerOperatorOperationById(operation);
        const isAdminWrite = row && writes.includes(row);
        const isHermesSubmit = operation === "hermes_submit_draft" && hermesSubmitAvailable;
        if (!isAdminWrite && !isHermesSubmit) return errorResult("That signed challenge operation is not available to this operator.");
        const candidate = challengeFor.input || {};
        const query = challengeFor.query || {};
        if (isAdminWrite) {
          validateOwnerOperatorInput(candidate);
          ownerOperatorPath(row, query);
        }
        const boundInput = isAdminWrite ? { input: candidate, query } : hermesSubmitInput(candidate);
        const challenge = issueOperatorChallenge({
          operatorId: principal.id,
          sessionId,
          operation,
          input: boundInput,
          secret: operatorChallengeSecret(config.env),
        });
        return textResult({ ...result, challenge });
      } catch {
        return errorResult("A signed operator challenge could not be issued for that operation.");
      }
    },
  );

  if (reads.length) {
    server.registerTool(
      OWNER_OPERATOR_ADMIN_READ_TOOL,
      {
        description:
          "Run one allowlisted read-only admin operation through the existing RBAC, workspace-scope, validation, and audit-aware admin adapter. Call ms_realty_admin_context first to discover operation IDs.",
        inputSchema: z
          .object({ operation: z.enum(reads.map((row) => row.operation)), query: OWNER_OPERATOR_QUERY })
          .strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ operation, query }) => {
        try {
          const row = ownerOperatorOperationById(operation);
          if (!row || !reads.includes(row)) return errorResult("That admin read operation is not available to this operator.");
          const { response, payload } = await adminJson(config, principal, ownerOperatorPath(row, query), { method: row.method });
          if (!response.ok) return errorResult(payload?.message || payload?.kind || "The admin read operation was rejected.");
          return textResult(ownerOperatorResult(row, response, payload));
        } catch (error) {
          return errorResult(error?.message || "The admin read operation was rejected.");
        }
      },
    );
  }

  if (!config.writesDisabled && canAdminMutate(principal) && writes.length) {
    server.registerTool(
      OWNER_OPERATOR_ADMIN_WRITE_TOOL,
      {
        description:
          "Run one allowlisted owner-confirmed admin mutation through the existing RBAC, workspace-scope, validation, persistence, and audit adapter. The confirmation must be the short-lived signed challenge returned by ms_realty_admin_context for the exact operation input. Hermes is never the approving actor.",
        inputSchema: z
          .object({
            operation: z.enum(writes.map((row) => row.operation)),
            input: OWNER_OPERATOR_BODY,
            query: OWNER_OPERATOR_QUERY,
            confirmation: z.string().min(1).max(2_048),
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      },
      async ({ operation, input, query, confirmation }) => {
        try {
          const row = ownerOperatorOperationById(operation);
          if (!row || !writes.includes(row)) return errorResult("That admin write operation is not available to this operator.");
          const body = validateOwnerOperatorInput(input);
          verifyMutationChallenge(confirmation, {
            operatorId: principal.id,
            sessionId,
            operation,
            input: { input: body, query: query || {} },
            secret: operatorChallengeSecret(config.env),
          });
          const { response, payload } = await adminJson(config, principal, ownerOperatorPath(row, query), {
            method: row.method,
            body,
          });
          if (!response.ok) return errorResult(payload?.message || payload?.kind || "The admin write operation was rejected.");
          return textResult(ownerOperatorResult(row, response, payload));
        } catch (error) {
          return errorResult(error?.message || "The admin write operation was rejected.");
        }
      },
    );
  }

  if (canAdminAccess(principal, "translations:read")) {
    const hermesOperations = HERMES_TOOL_COVERAGE.filter(
      (row) => row.read_only || (!config.writesDisabled && canAdminMutate(principal) && canAdminAccess(principal, "translations:write")),
    ).map((row) => row.operation);
    server.registerTool(
      OWNER_OPERATOR_HERMES_TOOL,
      {
        description:
          "Operate the complete Hermes desktop drafting loop: inspect safe queue status, pull non-sensitive translation tasks, or submit a fact-checked draft for human review. Hermes cannot approve, publish, mark indexable, or send messages.",
        inputSchema: z
          .object({
            operation: z.enum(hermesOperations),
            limit: z.number().int().min(1).max(10).optional(),
            target_locale: LOCALE.optional(),
            id: z.string().min(1).max(240).optional(),
            draft: z
              .object({
                title: z.string().min(1),
                body: z.string().min(1),
                seo_title: z.string().min(1),
                meta_description: z.string().min(1),
                citations: z.array(z.unknown()).optional(),
              })
              .passthrough()
              .optional(),
            model: z.string().min(1).max(120).optional(),
            confirmation: z.string().max(2_048).optional(),
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ operation, limit, target_locale: targetLocale, id, draft, model, confirmation }) => {
        try {
          if (operation === "hermes_status") return textResult(bridgeStatus());
          if (operation === "hermes_next_tasks") return textResult(bridgeNextTasks({ limit, targetLocale }));
          if (operation !== "hermes_submit_draft") {
            return errorResult("Unknown Hermes operation.");
          }
          verifyMutationChallenge(confirmation, {
            operatorId: principal.id,
            sessionId,
            operation,
            input: hermesSubmitInput({ id, draft, model, target_locale: targetLocale }),
            secret: operatorChallengeSecret(config.env),
          });
          return textResult(
            await bridgeSubmitDraft({
              id,
              draft,
              model,
              filePath: config.adminConfig.translationLedgerPath,
              auditLogPath: config.adminConfig.auditLogPath,
            }),
          );
        } catch (error) {
          return errorResult(`${error?.message || "Hermes rejected the request."}\n${BRIDGE_GUARDRAILS.join("\n")}`);
        }
      },
    );
  }
}

function authenticatedToolDefinitions(server, config, principal, sessionId) {
  if (canAdminAccess(principal, "operations:read")) {
    server.registerTool(
      "get_operator_brief",
      {
        description: "Read the privacy-safe operations brief. It excludes raw customer contacts and message bodies.",
        inputSchema: z.object({ locale: LOCALE.default("en") }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ locale }) => {
        const { response, payload } = await adminJson(config, principal, `/api/admin/reports?locale=${encodeURIComponent(locale)}`);
        if (!response.ok || payload?.report?.privacy?.raw_contacts_included !== false) {
          return errorResult("The privacy-safe operations brief is unavailable.");
        }
        const report = payload.report;
        return textResult({
          generated_at: report.generated_at,
          privacy: report.privacy,
          summary: report.summary,
          lead_volume: report.lead_volume,
          response_time: report.response_time,
          source_quality: report.source_quality,
          pipelines: report.pipelines,
          task_health: report.task_health,
          listing_inventory: report.listing_inventory,
          search: report.search,
        });
      },
    );

    server.registerTool(
      "get_broker_work_queue",
      {
        description:
          "Read the current lead, viewing, reply, seller, request, and inventory-matching queues. Raw contacts and customer message bodies are excluded.",
        inputSchema: z
          .object({
            locale: LOCALE.default("en"),
            scope: z.enum(["mine", "team"]).default("mine"),
            limit: z.number().int().min(1).max(50).default(20),
          })
          .strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ locale, scope, limit }) => {
        try {
          const { response, payload } = await adminJson(
            config,
            principal,
            `/api/admin/today?locale=${encodeURIComponent(locale)}`,
          );
          if (!response.ok) return errorResult("The broker work queue is unavailable.");
          const assigned = (row) =>
            scope === "team" ||
            [row.assigned_broker, row.broker, row.owner, row.reviewer].filter(Boolean).includes(principal.id);
          const bounded = (rows, map) => (Array.isArray(rows) ? rows.filter(assigned).slice(0, limit).map(map) : []);
          return textResult({
            privacy: { raw_contacts_included: false, customer_message_bodies_included: false },
            scope,
            summary: payload.summary,
            queue_summaries: {
              lead_sla: payload.leadSla?.summary,
              lead_pipeline: payload.leadPipelineQueue?.summary,
              reply_delivery: payload.replyDeliveryQueue?.summary,
              viewing_follow_up: payload.viewingFollowUpQueue?.summary,
              seller_pipeline: payload.sellerPipelineQueue?.summary,
              public_requests: payload.publicRequestQueue?.summary,
            },
            lead_pipeline: bounded(payload.leadPipelineQueue?.rows, (row) => ({
              lead_id: row.lead_id,
              lead_type: row.lead_type,
              listing_reference: row.listing_reference || null,
              original_language: row.original_language,
              assigned_broker: row.assigned_broker,
              pipeline: row.pipeline,
              stage: row.stage,
              status: row.status,
              next_action: row.next_action,
              next_follow_up_at: row.next_follow_up_at,
              overdue: row.overdue === true,
            })),
            viewings: bounded(payload.viewingFollowUpQueue?.rows, (row) => ({
              viewing_id: row.viewing_id,
              lead_id: row.lead_id,
              listing_reference: row.listing_reference || null,
              broker: row.broker,
              starts_at: row.starts_at,
              viewing_status: row.viewing_status,
              task: row.task,
              due_at: row.due_at,
              overdue: row.overdue === true,
            })),
            reply_delivery: bounded(payload.replyDeliveryQueue?.rows, (row) => ({
              reply_id: row.reply_id,
              lead_id: row.lead_id,
              listing_reference: row.listing_reference || null,
              reply_language: row.reply_language,
              reviewer: row.reviewer,
              status: row.status,
              last_action: row.last_action || null,
              failure_count: row.failure_count || 0,
            })),
            seller_pipeline: bounded(payload.sellerPipelineQueue?.rows, (row) => ({
              seller_pipeline_id: row.seller_pipeline_id,
              lead_id: row.lead_id,
              owner: row.owner,
              stage: row.stage,
              status: row.status,
              task: row.task,
              due_at: row.due_at,
              listing_reference: row.listing_reference || null,
              overdue: row.overdue === true,
            })),
            public_requests: bounded(payload.publicRequestQueue?.rows, (row) => ({
              request_type: row.request_type,
              request_id: row.request_id,
              requested_locale: row.requested_locale,
              owner: row.owner,
              status: row.status,
              next_follow_up_at: row.next_follow_up_at,
              last_action: row.last_action || null,
              overdue: row.overdue === true,
            })),
            inventory_matches: bounded(payload.leadMatching?.rows, (row) => ({
              lead_id: row.lead_id,
              assigned_broker: row.assigned_broker,
              pipeline_stage: row.pipeline_stage,
              qualification_complete: row.qualification_complete === true,
              match_count: row.match_count || 0,
              matches: (row.matches || []).slice(0, 5).map((match) => ({
                listing_id: match.listing_id,
                path: match.path,
                title: match.title,
                location: match.location,
                property_type: match.property_type,
                offer_type: match.offer_type,
                price_eur: match.price_eur ?? null,
                price_on_request: match.price_on_request === true,
              })),
            })),
          });
        } catch {
          return errorResult("The broker work queue is unavailable.");
        }
      },
    );
  }

  if (canAdminAccess(principal, "content:read")) {
    server.registerTool(
      "get_listing_content_queue",
      {
        description: "Read a bounded listing-content review queue and summary. It excludes customer data and cannot approve or publish content.",
        inputSchema: z
          .object({
            locale: LOCALE.default("en"),
            query: TEXT(160).optional(),
            status: LISTING_STATUS.optional(),
            source_locale: LOCALE.optional(),
            page: z.number().int().min(1).max(100).default(1),
          })
          .strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ locale, query, status, source_locale: sourceLocale, page }) => {
        try {
          const params = new URLSearchParams({ locale, page: String(page) });
          if (query) params.set("q", query);
          if (status) params.set("status", status);
          if (sourceLocale) params.set("sourceLocale", sourceLocale);
          const { response, payload } = await adminJson(config, principal, `/api/admin/listings?${params}`);
          if (!response.ok || !Array.isArray(payload?.listings)) return errorResult("The listing content queue is unavailable.");
          return textResult({
            summary: {
              total_listings: payload.summary?.total || 0,
              visible_listings: payload.summary?.visible || 0,
              review_required: payload.summary?.reviewRequired || 0,
              translation_review_required: payload.summary?.translationReviewRequired || 0,
            },
            filters: {
              query: payload.filters?.q || "",
              status: payload.filters?.status || "",
              source_locale: payload.filters?.sourceLocale || "",
            },
            pagination: {
              page: payload.pagination?.page || 1,
              page_size: payload.pagination?.pageSize || 0,
              total_rows: payload.pagination?.totalRows || 0,
              total_pages: payload.pagination?.totalPages || 0,
            },
            listings: payload.listings.slice(0, 25).map((listing) => ({
              listing_id: listing.id,
              title: listing.title,
              location: listing.location,
              source_locale: listing.source_locale,
              listing_status: listing.listing_status,
              cms_status: listing.cms_status,
              price_eur: listing.price_eur ?? null,
              price_on_request: listing.price_on_request === true,
              public_gallery_assets: listing.public_gallery_assets || 0,
              metadata_gaps: listing.metadata_gaps || 0,
              review_required: listing.review_required === true,
              translation_review_required: listing.translation_review_required || 0,
              editor_path: listing.editor_path,
            })),
          });
        } catch {
          return errorResult("The listing content queue is unavailable.");
        }
      },
    );
  }

  if (canAdminAccess(principal, "translations:read")) {
    server.registerTool(
      "get_translation_queue",
      {
        description: "Read a bounded translation review queue. It never approves, publishes, or makes content indexable.",
        inputSchema: z
          .object({
            locale: LOCALE.default("en"),
            target_locale: LOCALE.optional(),
            task_type: TEXT(80).optional(),
            query: TEXT(160).optional(),
            page: z.number().int().min(1).max(100).default(1),
          })
          .strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ locale, target_locale: targetLocale, task_type: taskType, query, page }) => {
        const params = new URLSearchParams({ locale, page: String(page) });
        if (targetLocale) params.set("targetLocale", targetLocale);
        if (taskType) params.set("taskType", taskType);
        if (query) params.set("q", query);
        const { response, payload } = await adminJson(config, principal, `/api/admin/translations?${params}`);
        if (!response.ok) return errorResult("The translation review queue is unavailable.");
        return textResult({
          summary: payload.summary,
          filters: payload.filters,
          pagination: payload.pagination,
          tasks: (payload.translationTasks || []).slice(0, 25).map((task) => ({
            listing_id: task.listing_id,
            source_locale: task.source_locale,
            target_locale: task.target_locale,
            current_status: task.current_status,
            task_type: task.task_type,
            provider_mode: task.provider_mode,
            reviewer_role: task.reviewer_role,
            public_indexable: task.public_indexable === true,
            requires_human_approval: task.requires_human_approval === true,
            existing_task: task.existing_task,
            editor_path: task.editor_path,
          })),
        });
      },
    );
  }

  ownerOperatorToolDefinitions(server, config, principal, sessionId);
}

function createServer(config, principal, sessionId) {
  const server = new McpServer({ name: "ms-realty-operator", version: "1.0.0" });
  publicToolDefinitions(server, config);
  if (principal) authenticatedToolDefinitions(server, config, principal, sessionId);
  return server;
}

export async function renderMcpResponse(request, { config = mcpConfigFromEnv() } = {}) {
  try {
    const originRejection = rejectUntrustedOrigin(request, config);
    if (originRejection) return originRejection;
    const authHeader = request.headers.get("authorization") || "";
    const principal = authHeader ? await resolveMcpPrincipal(authHeader, config) : null;
    if ((config.oidc && !principal) || (authHeader && !principal)) return mcpUnauthorized(request, config);
    const sessionId = authHeader ? adminSessionFingerprint(authHeader) : "anonymous";
    const handler = createMcpHandler(() => createServer(config, principal, sessionId), { onerror: () => {} });
    return secured(await handler.fetch(request));
  } catch {
    return mcpResponse(500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
}
