import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "./app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "./app-api-adapter.mjs";
import { canAdminAccess, canAdminMutate, resolveAdminPrincipal } from "./admin-auth.mjs";
import { applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
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

export function mcpConfigFromEnv(env = process.env) {
  return {
    env,
    apiConfig: appApiConfigFromEnv(env),
    adminConfig: { ...appAdminConfigFromEnv(env), authEnv: env },
    allowedOrigins: configuredOrigins(env.MS_REALTY_MCP_ALLOWED_ORIGINS),
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

function draftSourceForListing(config, listingId) {
  const record = currentSeed(config).records.find((candidate) => candidate.collection === "listings" && candidate.id === listingId);
  if (!record) throw new Error("Known listing is required");
  return {
    objectType: "listing",
    objectId: record.id,
    sourceLocale: record.source_locale,
    sourceContent: {
      title: record.facts?.h1 || record.facts?.title || record.seo?.title || record.id,
      description: record.facts?.description || record.seo?.description || "",
    },
    propertyFacts: {
      id: record.id,
      ...(record.facts?.location ? { location: record.facts.location } : {}),
    },
  };
}

async function adminJson(config, authHeader, pathname, { method = "GET", body } = {}) {
  const headers = { authorization: authHeader };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await renderAppAdminResponse(
    new Request(`http://mcp.local${pathname}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { config: config.adminConfig },
  );
  const payload = await response.json().catch(() => null);
  return { response, payload };
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

function authenticatedToolDefinitions(server, config, principal, authHeader) {
  if (canAdminAccess(principal, "operations:read")) {
    server.registerTool(
      "get_operator_brief",
      {
        description: "Read the privacy-safe operations brief. It excludes raw customer contacts and message bodies.",
        inputSchema: z.object({ locale: LOCALE.default("en") }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ locale }) => {
        const { response, payload } = await adminJson(config, authHeader, `/api/admin/reports?locale=${encodeURIComponent(locale)}`);
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
        const { response, payload } = await adminJson(config, authHeader, `/api/admin/translations?${params}`);
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

  if (canAdminMutate(principal) && canAdminAccess(principal, "translations:write")) {
    server.registerTool(
      "save_translation_draft",
      {
        description:
          "Save a staff-reviewed ChatGPT translation draft to the existing review queue. This cannot approve, publish, or make a translation indexable.",
        inputSchema: z
          .object({
            listing_id: LISTING_ID,
            target_locale: LOCALE,
            draft: z
              .object({
                title: TEXT(300).min(1),
                body: TEXT(12000).min(1),
                seo_title: TEXT(300).optional(),
                meta_description: TEXT(1000).optional(),
              })
              .strict(),
            confirmation: z.literal("SAVE_TRANSLATION_DRAFT"),
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ listing_id: listingId, target_locale: targetLocale, draft }) => {
        try {
          const source = draftSourceForListing(config, listingId);
          const { response, payload } = await adminJson(config, authHeader, "/api/admin/translations/draft", {
            method: "POST",
            body: {
              ...source,
              targetLocale,
              draftSource: "human",
              draftOutput: {
                title: draft.title,
                body: draft.body,
                seo_title: draft.seo_title || draft.title,
                meta_description: draft.meta_description || "",
                citations: [{ source: "cms", field: "source_snapshot" }],
              },
            },
          });
          if (!response.ok) return errorResult("The translation draft was not saved. Check that all property facts are preserved.");
          return textResult({
            id: payload.id,
            listing_id: payload.object_id,
            target_locale: payload.target_locale,
            status: payload.status,
            public_indexable: payload.public_indexable === true,
            requires_human_approval: payload.requires_human_approval === true,
            next_step: "A qualified human reviewer must approve before this can become public.",
          });
        } catch {
          return errorResult("The translation draft was not saved. Check that the listing exists and the supplied content preserves its facts.");
        }
      },
    );
  }

  if (canAdminMutate(principal) && canAdminAccess(principal, "operations:write")) {
    server.registerTool(
      "queue_reviewed_reply",
      {
        description:
          "Queue a staff-reviewed ChatGPT reply for manual broker delivery. It never contacts a customer or records delivery as complete.",
        inputSchema: z
          .object({
            lead_id: TEXT(120).min(1),
            language: LOCALE,
            reviewed_reply: TEXT(4000).min(1),
            chatgpt_draft: TEXT(4000).optional(),
            confirmation: z.literal("QUEUE_FOR_MANUAL_DELIVERY"),
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ lead_id: leadId, language, reviewed_reply: reviewedReply, chatgpt_draft: chatgptDraft }) => {
        const { response, payload } = await adminJson(config, authHeader, "/api/admin/replies", {
          method: "POST",
          body: {
            leadId,
            language,
            reviewedReply,
            approved: true,
            ...(chatgptDraft ? { hermesDraftText: chatgptDraft } : {}),
          },
        });
        if (!response.ok) return errorResult("The reviewed reply was not queued.");
        return textResult({
          id: payload.id,
          lead_id: payload.lead_id,
          reply_language: payload.reply_language,
          status: payload.status,
          idempotent: payload.idempotent === true,
          next_step: "A broker must manually send the reply and then record the actual delivery outcome.",
        });
      },
    );
  }
}

function createServer(config, principal, authHeader) {
  const server = new McpServer({ name: "ms-realty-operator", version: "1.0.0" });
  publicToolDefinitions(server, config);
  if (principal) authenticatedToolDefinitions(server, config, principal, authHeader);
  return server;
}

export async function renderMcpResponse(request, { config = mcpConfigFromEnv() } = {}) {
  try {
    const originRejection = rejectUntrustedOrigin(request, config);
    if (originRejection) return originRejection;
    const authHeader = request.headers.get("authorization") || "";
    const principal = authHeader ? resolveAdminPrincipal(authHeader, config.env) : null;
    if (authHeader && !principal) {
      return mcpResponse(
        401,
        { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
        { "www-authenticate": 'Bearer realm="ms-realty-mcp"' },
      );
    }
    const handler = createMcpHandler(() => createServer(config, principal, authHeader), { onerror: () => {} });
    return secured(await handler.fetch(request));
  } catch {
    return mcpResponse(500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
}
