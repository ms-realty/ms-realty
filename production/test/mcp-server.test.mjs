import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { adminSessionFingerprint } from "../lib/admin-sessions.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readLeadAssignments } from "../lib/lead-assignments.mjs";
import {
  mcpConfigFromEnv,
  mcpOidcConfigFromEnv,
  renderMcpProtectedResourceMetadata,
  renderMcpResponse,
} from "../lib/mcp-server.mjs";
import { operatorChallengeSecret, verifyOperatorChallenge } from "../lib/operator-challenge.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const EDITOR_TOKEN = "mcp-editor-token-0123456789abcdef";
const BROKER_TOKEN = "mcp-broker-token-0123456789abcdef";
const TRANSLATOR_TOKEN = "mcp-translator-token-0123456789abcd";
const LEGACY_MUTATION_TOOLS = [
  "edit_listing_content",
  "bulk_update_listing_status",
  "save_translation_draft",
  "queue_reviewed_reply",
  "run_operator_workflow",
];
const BROKER_PROFILES = [
  { id: "mcp_broker", languages: ["en"] },
  { id: "broker_ru", languages: ["ru"] },
];

function jsonl(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

function fixture({ durableListingWrites = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-mcp-"));
  const lead = {
    lead_id: "mcp-lead-0001",
    received_at: "2026-07-29T10:00:00.000Z",
    source: "website_listing_detail",
    lead_type: "buyer",
    listing_reference: "MS-CRAWL-0001",
    original_language: "en",
    admin_locale: "en",
    message_original: "Please contact me about this property.",
    contact_preference: "email",
    assigned_broker: "mcp_broker",
  };
  const paths = {
    auditLogPath: jsonl(directory, "audit"),
    leadAssignmentLedgerPath: jsonl(directory, "lead-assignments"),
    leadLedgerPath: jsonl(directory, "leads", [lead]),
    listingEditLedgerPath: jsonl(directory, "listing-edits"),
    mediaReviewLedgerPath: jsonl(directory, "media-reviews"),
    publicationSchedulePath: jsonl(directory, "publication-schedules"),
    replyOutboxPath: jsonl(directory, "replies"),
    translationLedgerPath: jsonl(directory, "translations"),
    hermesWorkerReportPath: path.join(directory, "hermes-draft-worker-report.json"),
  };
  const env = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
      { id: "mcp_editor", token: EDITOR_TOKEN, roles: ["editor"] },
      { id: "mcp_broker", token: BROKER_TOKEN, roles: ["broker"] },
      { id: "mcp_translator", token: TRANSLATOR_TOKEN, roles: ["translator"] },
    ]),
    MS_REALTY_AUDIT_LOG_PATH: paths.auditLogPath,
    MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH: paths.leadAssignmentLedgerPath,
    MS_REALTY_LEAD_LEDGER_PATH: paths.leadLedgerPath,
    MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.listingEditLedgerPath,
    MS_REALTY_MEDIA_REVIEW_LEDGER_PATH: paths.mediaReviewLedgerPath,
    MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH: paths.publicationSchedulePath,
    MS_REALTY_REPLY_OUTBOX_PATH: paths.replyOutboxPath,
    MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translationLedgerPath,
    MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesWorkerReportPath,
    MS_REALTY_REVIEWED_AT: "2026-07-29T10:05:00.000Z",
    MS_REALTY_OPERATOR_CHALLENGE_SECRET: "mcp-operator-challenge-test-secret-longer-than-thirty-two-characters",
    ...(durableListingWrites ? { MS_REALTY_MCP_DURABLE_LISTING_WRITES: "1" } : {}),
  };
  const config = mcpConfigFromEnv(env);
  config.brokerProfiles = BROKER_PROFILES;
  config.adminConfig.brokerProfiles = BROKER_PROFILES;
  const runtime = createPayloadDraftRuntime();
  const durableListingAudits = [];
  config.payloadListingRuntime = runtime.payload;
  config.adminConfig.payloadListingRuntime = runtime.payload;
  config.adminConfig.durableListingAuditLogger = (line) => durableListingAudits.push(JSON.parse(line));
  return { config, durableListingAudits, paths, runtime };
}

function ssePayload(text) {
  const match = text.match(/^data:\s*(.+)$/m);
  return JSON.parse(match ? match[1] : text);
}

async function mcpCall(config, body, headers = {}) {
  const response = await renderMcpResponse(
    new Request("http://local.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }),
    { config },
  );
  return { response, payload: ssePayload(await response.text()) };
}

async function listTools(config, headers = {}) {
  const result = await mcpCall(config, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, headers);
  assert.equal(result.response.status, 200);
  return result.payload.result.tools.map((tool) => tool.name);
}

async function callTool(config, name, args, headers = {}) {
  const result = await mcpCall(
    config,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
    headers,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.result.isError, undefined);
  return JSON.parse(result.payload.result.content[0].text);
}

async function signedAdminWrite(config, operation, input, auth) {
  const context = await callTool(config, "ms_realty_admin_context", { challenge_for: { operation, input } }, auth);
  return callTool(
    config,
    "ms_realty_admin_write",
    { operation, input, confirmation: context.challenge.token },
    auth,
  );
}

test("MCP separates anonymous public discovery from role-bound operator tools", async () => {
  const { config } = fixture();
  assert.deepEqual(await listTools(config), ["search_public_listings", "get_public_listing", "get_launch_status"]);

  const editorTools = await listTools(config, { authorization: `Bearer ${EDITOR_TOKEN}` });
  assert.deepEqual(editorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
    "ms_realty_admin_write",
    "ms_realty_hermes",
  ]);

  const brokerTools = await listTools(config, { authorization: `Bearer ${BROKER_TOKEN}` });
  assert.deepEqual(brokerTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_operator_brief",
    "get_broker_work_queue",
    "get_listing_content_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
    "ms_realty_admin_write",
  ]);

  const translatorTools = await listTools(config, { authorization: `Bearer ${TRANSLATOR_TOKEN}` });
  assert.deepEqual(translatorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
    "ms_realty_admin_write",
    "ms_realty_hermes",
  ]);
  for (const tool of LEGACY_MUTATION_TOOLS) {
    assert.equal(editorTools.includes(tool), false, `${tool} must use the signed owner/operator mutation path`);
    assert.equal(brokerTools.includes(tool), false, `${tool} must use the signed owner/operator mutation path`);
    assert.equal(translatorTools.includes(tool), false, `${tool} must use the signed owner/operator mutation path`);
  }
});

test("owner/operator MCP dispatch is allowlisted, role-scoped, confirmed, and adapter-audited", async () => {
  const { config, durableListingAudits, paths, runtime } = fixture();
  const auth = { authorization: `Bearer ${EDITOR_TOKEN}` };
  const context = await callTool(config, "ms_realty_admin_context", {}, auth);
  assert.equal(context.operator_id, "mcp_editor");
  assert.equal(context.summary.total, context.operations.length);
  assert.ok(context.operations.some((row) => row.operation === "admin_get_listings" && row.execution === "mcp_delegated"));
  assert.ok(context.operations.some((row) => row.operation === "admin_get_security_two_factor" && row.execution === "browser_session"));
  assert.match(context.browser_session_note, /read\/open registry entries through WebMCP/);
  assert.match(context.browser_session_note, /mutations remain signed delegated MCP or human admin forms/);

  const listings = await callTool(
    config,
    "ms_realty_admin_read",
    { operation: "admin_get_listings", query: { locale: "en", q: "MS-CRAWL-0001" } },
    auth,
  );
  assert.equal(listings.operation, "admin_get_listings");
  assert.equal(listings.http_status, 200);
  assert.equal(listings.result.listings[0].id, "MS-CRAWL-0001");

  const unconfirmed = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: {
        name: "ms_realty_admin_write",
        arguments: {
          operation: "admin_post_listings_status",
          input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "reserved" },
          confirmation: "CONFIRM_MS_REALTY_ADMIN_OPERATION",
        },
      },
    },
    auth,
  );
  assert.equal(unconfirmed.payload.result.isError, true);
  assert.notEqual(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "reserved");

  const challenge = await callTool(
    config,
    "ms_realty_admin_context",
    {
      challenge_for: {
        operation: "admin_post_listings_status",
        input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "reserved" },
      },
    },
    auth,
  );
  assert.equal(challenge.challenge.operation, "admin_post_listings_status");
  const mismatchedInput = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: {
        name: "ms_realty_admin_write",
        arguments: {
          operation: "admin_post_listings_status",
          input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "sold" },
          confirmation: challenge.challenge.token,
        },
      },
    },
    auth,
  );
  assert.equal(mismatchedInput.payload.result.isError, true);
  assert.notEqual(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "sold");
  config.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "mcp_editor", token: EDITOR_TOKEN, roles: ["editor"] },
    { id: "mcp_editor_other", token: "mcp-editor-other-token-0123456789abcdef", roles: ["editor"] },
    { id: "mcp_broker", token: BROKER_TOKEN, roles: ["broker"] },
    { id: "mcp_translator", token: TRANSLATOR_TOKEN, roles: ["translator"] },
  ]);
  const crossSessionReplay = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: {
        name: "ms_realty_admin_write",
        arguments: {
          operation: "admin_post_listings_status",
          input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "reserved" },
          confirmation: challenge.challenge.token,
        },
      },
    },
    { authorization: "Bearer mcp-editor-other-token-0123456789abcdef" },
  );
  assert.equal(crossSessionReplay.payload.result.isError, true);
  assert.notEqual(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "reserved");
  const [hermesTask] = await callTool(config, "ms_realty_hermes", { operation: "hermes_next_tasks", limit: 1 }, auth);
  const hermesPrompt = JSON.parse(hermesTask.messages.at(-1).content);
  const factLine = Object.values(hermesPrompt.propertyFacts).filter(Boolean).join(" ");
  const hermesInput = {
    id: hermesTask.id,
    draft: {
      title: `${hermesTask.object_id} ${hermesTask.target_locale}`,
      body: `${factLine} ${hermesTask.target_locale} draft`,
      seo_title: `${hermesTask.object_id} ${hermesTask.target_locale}`,
      meta_description: `${factLine} ${hermesTask.target_locale} draft`,
      citations: hermesTask.citations,
    },
  };
  const hermesChallenge = await callTool(
    config,
    "ms_realty_admin_context",
    { challenge_for: { operation: "hermes_submit_draft", input: hermesInput } },
    auth,
  );
  assert.equal(
    verifyOperatorChallenge(hermesChallenge.challenge.token, {
      operatorId: "mcp_editor",
      sessionId: adminSessionFingerprint(auth.authorization),
      operation: "hermes_submit_draft",
      input: { ...hermesInput, model: null, target_locale: null },
      secret: operatorChallengeSecret(config.env),
    }).operation,
    "hermes_submit_draft",
  );
  const hermesChallengeWithExplicitNulls = await callTool(
    config,
    "ms_realty_admin_context",
    {
      challenge_for: {
        operation: "hermes_submit_draft",
        input: { ...hermesInput, model: null, target_locale: null },
      },
    },
    auth,
  );
  assert.equal(
    hermesChallengeWithExplicitNulls.challenge.input_hash,
    hermesChallenge.challenge.input_hash,
    "optional Hermes fields canonicalize identically when omitted or null",
  );
  const hermesCrossSessionReplay = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: {
        name: "ms_realty_hermes",
        arguments: {
          operation: "hermes_submit_draft",
          ...hermesInput,
          confirmation: hermesChallenge.challenge.token,
        },
      },
    },
    { authorization: "Bearer mcp-editor-other-token-0123456789abcdef" },
  );
  assert.equal(hermesCrossSessionReplay.payload.result.isError, true);
  const hermesDraft = await callTool(
    config,
    "ms_realty_hermes",
    {
      operation: "hermes_submit_draft",
      ...hermesInput,
      confirmation: hermesChallenge.challenge.token,
    },
    auth,
  );
  assert.equal(hermesDraft.persisted.requires_human_approval, true);
  assert.equal(hermesDraft.report.path, paths.hermesWorkerReportPath);
  assert.equal(fs.existsSync(paths.hermesWorkerReportPath), true);
  const hermesReplay = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: {
        name: "ms_realty_hermes",
        arguments: {
          operation: "hermes_submit_draft",
          ...hermesInput,
          confirmation: hermesChallenge.challenge.token,
        },
      },
    },
    auth,
  );
  assert.equal(hermesReplay.payload.result.isError, true);
  const status = await callTool(
    config,
    "ms_realty_admin_write",
    {
      operation: "admin_post_listings_status",
      input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "reserved" },
      confirmation: challenge.challenge.token,
    },
    auth,
  );
  assert.equal(status.operation, "admin_post_listings_status");
  assert.equal(status.result.kind, "bulk_listing_status_update");
  assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "reserved");
  const replay = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: {
        name: "ms_realty_admin_write",
        arguments: {
          operation: "admin_post_listings_status",
          input: { listingIds: ["MS-CRAWL-0001"], targetStatus: "reserved" },
          confirmation: challenge.challenge.token,
        },
      },
    },
    auth,
  );
  assert.equal(replay.payload.result.isError, true);
  const audit = readAuditLog(paths.auditLogPath);
  assert.equal(durableListingAudits.some((row) => row.actor === "mcp_editor"), true);
  assert.equal(audit.some((row) => row.action === "hermes_model_call" && row.actor === "hermes_worker"), true);

  const browserOnly = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "ms_realty_admin_read", arguments: { operation: "admin_get_connections" } },
    },
    auth,
  );
  assert.equal(browserOnly.payload.result.isError, true);
});

test("MCP returns only public listing data and rejects untrusted origins", async () => {
  const { config } = fixture();
  const search = await callTool(config, "search_public_listings", { locale: "bg", query: "Sandanski", page_size: 1 });
  assert.equal(search.listings.length, 1);
  assert.equal("actions" in search.listings[0], false);

  const listing = await callTool(config, "get_public_listing", { listing_id: "MS-CRAWL-0001", locale: "bg" });
  assert.equal(listing.id, "MS-CRAWL-0001");
  assert.equal(listing.media.gallery.length > 0, true);
  assert.equal(JSON.stringify(listing).includes("site_chrome"), false);

  const rejected = await mcpCall(
    config,
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
    { origin: "https://untrusted.example" },
  );
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.payload.error.message, "Forbidden origin");
});

test("MCP OIDC configuration requires a complete HTTPS resource-server identity", () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_PUBLIC_ORIGIN: "https://realty.example",
    MS_REALTY_MCP_OIDC_ISSUER: "https://identity.example",
    MS_REALTY_MCP_OIDC_AUDIENCE: "https://realty.example/mcp",
    MS_REALTY_MCP_OIDC_JWKS_URL: "https://identity.example/.well-known/jwks.json",
    MS_REALTY_MCP_OIDC_PRINCIPALS_JSON: JSON.stringify([
      { subject: "staff-subject-1", id: "staff_editor", roles: ["editor"] },
    ]),
  };
  const oidc = mcpOidcConfigFromEnv(env);
  assert.equal(oidc.issuer, "https://identity.example");
  assert.equal(oidc.audience, "https://realty.example/mcp");
  assert.equal(oidc.scope, "ms-realty:operator");
  assert.deepEqual(oidc.principals.get("staff-subject-1"), { id: "staff_editor", roles: ["editor"] });
  assert.throws(
    () => mcpOidcConfigFromEnv({ ...env, MS_REALTY_MCP_OIDC_JWKS_URL: "" }),
    /MCP OIDC configuration is incomplete: MS_REALTY_MCP_OIDC_JWKS_URL/,
  );
  assert.throws(
    () => mcpOidcConfigFromEnv({ ...env, MS_REALTY_MCP_OIDC_ISSUER: "http://identity.example" }),
    /MS_REALTY_MCP_OIDC_ISSUER must use https/,
  );
  assert.throws(
    () =>
      mcpOidcConfigFromEnv({
        ...env,
        MS_REALTY_MCP_OIDC_PRINCIPALS_JSON: JSON.stringify([
          { subject: "staff-subject-1", id: "staff_editor", roles: ["editor"] },
          { subject: "staff-subject-2", id: "staff_editor", roles: ["broker"] },
        ]),
      }),
    /operator IDs must be unique/,
  );
});

test("MCP publishes OAuth metadata and binds a verified OIDC subject to existing role tools", async () => {
  const { config, durableListingAudits, runtime } = fixture({ durableListingWrites: true });
  config.publicOrigin = "https://realty.example";
  config.oidc = {
    issuer: "https://identity.example",
    audience: "https://realty.example/mcp",
    jwksUrl: "https://identity.example/.well-known/jwks.json",
    scope: "ms-realty:operator",
    principals: new Map([["staff-subject-1", { id: "staff_editor", roles: ["editor"] }]]),
    verify: async (token) => {
      if (token === "valid-oidc-token") return { payload: { sub: "staff-subject-1", scope: "openid ms-realty:operator" } };
      if (token === "wrong-scope-token") return { payload: { sub: "staff-subject-1", scope: "openid" } };
      if (token === "unknown-subject-token") return { payload: { sub: "staff-subject-2", scope: "ms-realty:operator" } };
      throw new Error("invalid token");
    },
  };

  const unauthenticated = await mcpCall(config, { jsonrpc: "2.0", id: 10, method: "tools/list", params: {} });
  assert.equal(unauthenticated.response.status, 401);
  assert.match(
    unauthenticated.response.headers.get("www-authenticate"),
    /resource_metadata="https:\/\/realty\.example\/\.well-known\/oauth-protected-resource\/mcp"/,
  );
  assert.match(unauthenticated.response.headers.get("www-authenticate"), /scope="ms-realty:operator"/);

  const metadataResponse = renderMcpProtectedResourceMetadata(
    new Request("http://local.test/.well-known/oauth-protected-resource/mcp"),
    { config },
  );
  assert.equal(metadataResponse.status, 200);
  assert.deepEqual(await metadataResponse.json(), {
    resource: "https://realty.example/mcp",
    authorization_servers: ["https://identity.example"],
    scopes_supported: ["ms-realty:operator"],
    bearer_methods_supported: ["header"],
  });

  const auth = { authorization: "Bearer valid-oidc-token" };
  const tools = await listTools(config, auth);
  assert.equal(tools.includes("ms_realty_admin_write"), true);
  for (const tool of LEGACY_MUTATION_TOOLS) assert.equal(tools.includes(tool), false);
  const edit = await signedAdminWrite(
    config,
    "admin_post_listings_edit",
    {
      listingId: "MS-CRAWL-0001",
      patch: { description: "OIDC-attributed staff edit for human publication review." },
    },
    auth,
  );
  assert.equal(edit.operation, "admin_post_listings_edit");
  assert.equal(edit.result.kind, "listing_draft_saved");
  assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.description, "OIDC-attributed staff edit for human publication review.");
  assert.equal(durableListingAudits[0].actor, "staff_editor");
  assert.equal(durableListingAudits[0].receipt, "listing.workflow.last_edit_event");

  for (const token of ["wrong-scope-token", "unknown-subject-token", "invalid-token"]) {
    const rejected = await mcpCall(
      config,
      { jsonrpc: "2.0", id: 11, method: "tools/list", params: {} },
      { authorization: `Bearer ${token}` },
    );
    assert.equal(rejected.response.status, 401);
  }
});

test("MCP exposes a privacy-safe broker queue and routes confirmed work through the admin audit boundary", async () => {
  const { config, paths } = fixture();
  const auth = { authorization: `Bearer ${BROKER_TOKEN}` };
  const queue = await callTool(config, "get_broker_work_queue", { locale: "en", scope: "mine" }, auth);
  assert.deepEqual(queue.privacy, { raw_contacts_included: false, customer_message_bodies_included: false });
  assert.equal(queue.lead_pipeline[0].lead_id, "mcp-lead-0001");
  assert.equal(JSON.stringify(queue).includes("message_original"), false);
  assert.equal(JSON.stringify(queue).includes("Please contact me"), false);

  const assignment = await signedAdminWrite(
    config,
    "admin_post_leads_assign",
    {
      leadId: "mcp-lead-0001",
      brokerId: "broker_ru",
      reason: "Confirmed reassignment for Russian-language follow-up.",
      assignmentConfirmed: true,
    },
    auth,
  );
  assert.equal(assignment.result.lead_id, "mcp-lead-0001");
  assert.equal(assignment.result.broker_id, "broker_ru");
  assert.equal(readLeadAssignments(paths.leadAssignmentLedgerPath)[0].assigned_by, "mcp_broker");
  assert.equal(readAuditLog(paths.auditLogPath).some((row) => row.action === "lead_assigned" && row.actor === "mcp_broker"), true);
});

test("the standalone production server serves the same MCP endpoint", async () => {
  const app = createHttpApp({ redirects: [] });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/mcp",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
  });
  assert.equal(response.status, 200);
  const payload = ssePayload(response.body);
  assert.equal(payload.result.tools.some((tool) => tool.name === "search_public_listings"), true);

  const metadata = await dispatchHttp(app, {
    method: "GET",
    url: "/.well-known/oauth-protected-resource/mcp",
    headers: {},
  });
  assert.equal(metadata.status, 404);
  assert.match(metadata.body, /MCP OAuth protected resource is not configured/);
});

test("ephemeral runtimes mask every ledger-writing MCP tool", async () => {
  const { config } = fixture({ durableListingWrites: true });
  assert.equal(config.writesDisabled, false);

  const masked = { ...config, writesDisabled: true };
  const editorTools = await listTools(masked, { authorization: `Bearer ${EDITOR_TOKEN}` });
  assert.deepEqual(editorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
    "ms_realty_hermes",
  ]);
  for (const name of LEGACY_MUTATION_TOOLS) {
    assert.equal(editorTools.includes(name), false, `${name} must not register on ephemeral runtimes`);
  }

  const brokerTools = await listTools(masked, { authorization: `Bearer ${BROKER_TOKEN}` });
  assert.deepEqual(brokerTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_operator_brief",
    "get_broker_work_queue",
    "get_listing_content_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
  ]);
  const translatorTools = await listTools(masked, { authorization: `Bearer ${TRANSLATOR_TOKEN}` });
  assert.deepEqual(translatorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
    "ms_realty_admin_context",
    "ms_realty_admin_read",
    "ms_realty_hermes",
  ]);

  const flagged = mcpConfigFromEnv({ NODE_ENV: "test", MS_REALTY_MCP_WRITES_DISABLED: "1", MS_REALTY_MCP_DURABLE_LISTING_WRITES: "1" });
  assert.equal(flagged.writesDisabled, true);
  assert.equal(flagged.durableListingWritesEnabled, true);
  assert.equal(mcpConfigFromEnv({ NODE_ENV: "test", MS_REALTY_MCP_WRITES_DISABLED: "1" }).durableListingWritesEnabled, false);
});
