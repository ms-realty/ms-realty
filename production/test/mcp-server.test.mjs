import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readListingEdits } from "../lib/listing-edits.mjs";
import { readLeadAssignments } from "../lib/lead-assignments.mjs";
import { readReplyOutbox } from "../lib/lead-replies.mjs";
import {
  mcpConfigFromEnv,
  mcpOidcConfigFromEnv,
  renderMcpProtectedResourceMetadata,
  renderMcpResponse,
} from "../lib/mcp-server.mjs";
import { readTranslationLedger } from "../lib/translation-ledger.mjs";

const EDITOR_TOKEN = "mcp-editor-token-0123456789abcdef";
const BROKER_TOKEN = "mcp-broker-token-0123456789abcdef";
const TRANSLATOR_TOKEN = "mcp-translator-token-0123456789abcd";

function jsonl(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

function fixture() {
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
    MS_REALTY_REVIEWED_AT: "2026-07-29T10:05:00.000Z",
  };
  const config = mcpConfigFromEnv(env);
  const payloadEdits = [];
  config.payloadListingWriter = async (input) => {
    payloadEdits.push(input);
    return { id: input.listingId };
  };
  return { config, paths, payloadEdits };
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

test("MCP separates anonymous public discovery from role-bound operator tools", async () => {
  const { config } = fixture();
  assert.deepEqual(await listTools(config), ["search_public_listings", "get_public_listing", "get_launch_status"]);

  const editorTools = await listTools(config, { authorization: `Bearer ${EDITOR_TOKEN}` });
  assert.deepEqual(editorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "edit_listing_content",
    "bulk_update_listing_status",
    "get_translation_queue",
    "save_translation_draft",
  ]);

  const brokerTools = await listTools(config, { authorization: `Bearer ${BROKER_TOKEN}` });
  assert.deepEqual(brokerTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_operator_brief",
    "get_broker_work_queue",
    "get_listing_content_queue",
    "queue_reviewed_reply",
    "run_operator_workflow",
  ]);

  const translatorTools = await listTools(config, { authorization: `Bearer ${TRANSLATOR_TOKEN}` });
  assert.deepEqual(translatorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
    "save_translation_draft",
  ]);
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
  const { config, paths, payloadEdits } = fixture();
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
  assert.equal(tools.includes("edit_listing_content"), true);
  assert.equal(tools.includes("queue_reviewed_reply"), false);
  const edit = await callTool(
    config,
    "edit_listing_content",
    {
      listing_id: "MS-CRAWL-0001",
      patch: { description: "OIDC-attributed staff edit for human publication review." },
      confirmation: "EDIT_LISTING_CONTENT",
    },
    auth,
  );
  assert.deepEqual(edit.changed_fields, ["description"]);
  assert.equal(edit.draft_only, true);
  assert.equal(payloadEdits[0].principal.id, "staff_editor");
  assert.equal(payloadEdits[0].patch.description, "OIDC-attributed staff edit for human publication review.");
  assert.equal(readAuditLog(paths.auditLogPath)[0].actor, "staff_editor");

  for (const token of ["wrong-scope-token", "unknown-subject-token", "invalid-token"]) {
    const rejected = await mcpCall(
      config,
      { jsonrpc: "2.0", id: 11, method: "tools/list", params: {} },
      { authorization: `Bearer ${token}` },
    );
    assert.equal(rejected.response.status, 401);
  }
});

test("MCP saves review-only translation drafts and queues replies without delivery", async () => {
  const { config, paths } = fixture();
  const translation = await callTool(
    config,
    "save_translation_draft",
    {
      listing_id: "MS-CRAWL-0001",
      target_locale: "en",
      draft: {
        title: "MS-CRAWL-0001 Sandanski commercial property",
        body: "MS-CRAWL-0001 is a commercial property in Sandanski. This draft preserves the available source facts for human review.",
        seo_title: "MS-CRAWL-0001 Sandanski commercial property",
        meta_description: "MS-CRAWL-0001 commercial property in Sandanski, prepared as a factual translation draft for human review before publication.",
      },
      confirmation: "SAVE_TRANSLATION_DRAFT",
    },
    { authorization: `Bearer ${EDITOR_TOKEN}` },
  );
  assert.equal(translation.status, "human_edited");
  assert.equal(translation.public_indexable, false);
  assert.equal(translation.requires_human_approval, true);
  assert.equal(readTranslationLedger(paths.translationLedgerPath)[0].public_indexable, false);
  assert.equal(readAuditLog(paths.auditLogPath)[0].action, "translation_drafted");
  assert.equal(readAuditLog(paths.auditLogPath)[0].actor, "mcp_editor");

  const reply = await callTool(
    config,
    "queue_reviewed_reply",
    {
      lead_id: "mcp-lead-0001",
      language: "en",
      reviewed_reply: "Thank you for your enquiry. A broker will contact you shortly with the verified property details.",
      chatgpt_draft: "Thank you for your enquiry. We will follow up with verified details.",
      confirmation: "QUEUE_FOR_MANUAL_DELIVERY",
    },
    { authorization: `Bearer ${BROKER_TOKEN}` },
  );
  assert.equal(reply.status, "queued_for_manual_send");
  assert.equal("reviewed_reply" in reply, false);
  const queued = readReplyOutbox(paths.replyOutboxPath)[0];
  assert.equal(queued.status, "queued_for_manual_send");
  assert.equal(queued.reviewer, "mcp_broker");
  assert.equal(readAuditLog(paths.auditLogPath).some((row) => row.action === "reply_approved"), true);
});

test("MCP exposes a privacy-safe broker queue and routes confirmed work through the admin audit boundary", async () => {
  const { config, paths } = fixture();
  const auth = { authorization: `Bearer ${BROKER_TOKEN}` };
  const queue = await callTool(config, "get_broker_work_queue", { locale: "en", scope: "mine" }, auth);
  assert.deepEqual(queue.privacy, { raw_contacts_included: false, customer_message_bodies_included: false });
  assert.equal(queue.lead_pipeline[0].lead_id, "mcp-lead-0001");
  assert.equal(JSON.stringify(queue).includes("message_original"), false);
  assert.equal(JSON.stringify(queue).includes("Please contact me"), false);

  const assignment = await callTool(
    config,
    "run_operator_workflow",
    {
      operation: "assign_lead",
      lead_id: "mcp-lead-0001",
      broker_id: "broker_ru",
      reason: "Confirmed reassignment for Russian-language follow-up.",
      confirmation: "RUN_OPERATOR_WORKFLOW",
    },
    auth,
  );
  assert.equal(assignment.lead_id, "mcp-lead-0001");
  assert.equal(assignment.broker_id, "broker_ru");
  assert.equal(readLeadAssignments(paths.leadAssignmentLedgerPath)[0].assigned_by, "mcp_broker");
  assert.equal(readAuditLog(paths.auditLogPath).some((row) => row.action === "lead_assigned" && row.actor === "mcp_broker"), true);
});

test("MCP bounds listing-content operations to authenticated, confirmed, non-approval changes", async () => {
  const { config, paths, payloadEdits } = fixture();
  const auth = { authorization: `Bearer ${EDITOR_TOKEN}` };

  const queue = await callTool(config, "get_listing_content_queue", { locale: "en", query: "MS-CRAWL-0001" }, auth);
  assert.equal(queue.summary.total_listings > 0, true);
  assert.equal(queue.listings[0].listing_id, "MS-CRAWL-0001");
  assert.equal("source_domain" in queue.listings[0], false);
  assert.equal(JSON.stringify(queue).includes("message_original"), false);

  const rejected = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "edit_listing_content",
        arguments: {
          listing_id: "MS-CRAWL-0001",
          patch: { description: "Unconfirmed edit." },
          confirmation: "EDIT_CONTENT",
        },
      },
    },
    auth,
  );
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.payload.result.isError, true);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).length, 0);

  const approvalAttempt = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "edit_listing_content",
        arguments: {
          listing_id: "MS-CRAWL-0001",
          patch: { publish_approved: true },
          confirmation: "EDIT_LISTING_CONTENT",
        },
      },
    },
    auth,
  );
  assert.equal(approvalAttempt.response.status, 200);
  assert.equal(approvalAttempt.payload.result.isError, true);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).length, 0);

  const spoofedIdentity = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "edit_listing_content",
        arguments: {
          listing_id: "MS-CRAWL-0001",
          patch: { description: "Spoofed identity edit." },
          editor: "somebody_else",
          confirmation: "EDIT_LISTING_CONTENT",
        },
      },
    },
    auth,
  );
  assert.equal(spoofedIdentity.response.status, 200);
  assert.equal(spoofedIdentity.payload.result.isError, true);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).length, 0);

  const edit = await callTool(
    config,
    "edit_listing_content",
    {
      listing_id: "MS-CRAWL-0001",
      patch: { description: "Staff-reviewed source description for the listing." },
      confirmation: "EDIT_LISTING_CONTENT",
    },
    auth,
  );
  assert.deepEqual(edit.changed_fields, ["description"]);
  assert.equal(edit.draft_only, true);
  assert.equal(edit.publication_approval_changed, false);
  assert.equal("editor" in edit, false);
  assert.equal(payloadEdits[0].principal.id, "mcp_editor");
  assert.equal(payloadEdits[0].patch.description, "Staff-reviewed source description for the listing.");
  assert.equal("publish_approved" in payloadEdits[0].patch, false);
  assert.equal("listing_status" in payloadEdits[0].patch, false);

  const rejectedBulk = await mcpCall(
    config,
    {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "bulk_update_listing_status",
        arguments: {
          listing_ids: ["MS-CRAWL-0001"],
          target_status: "reserved",
          confirmation: "UPDATE_LISTING_STATUS",
        },
      },
    },
    auth,
  );
  assert.equal(rejectedBulk.response.status, 200);
  assert.equal(rejectedBulk.payload.result.isError, true);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).length, 0);

  const status = await callTool(
    config,
    "bulk_update_listing_status",
    {
      listing_ids: ["MS-CRAWL-0001", "MS-CRAWL-0002"],
      target_status: "reserved",
      confirmation: "BULK_UPDATE_LISTING_STATUS",
    },
    auth,
  );
  assert.equal(status.target_status, "reserved");
  assert.equal(status.updated, 2);
  assert.deepEqual(status.changed_listing_ids, ["MS-CRAWL-0001", "MS-CRAWL-0002"]);
  assert.equal("edits" in status, false);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).every((row) => row.editor === "mcp_editor"), true);
  assert.equal(readListingEdits(paths.listingEditLedgerPath).every((row) => row.patch.publish_approved === undefined), true);
  assert.equal(
    readAuditLog(paths.auditLogPath).every((row) => !["translation_approved", "translation_published"].includes(row.action)),
    true,
  );
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
  const { config } = fixture();
  assert.equal(config.writesDisabled, false);

  const masked = { ...config, writesDisabled: true };
  const editorTools = await listTools(masked, { authorization: `Bearer ${EDITOR_TOKEN}` });
  assert.deepEqual(editorTools, [
    "search_public_listings",
    "get_public_listing",
    "get_launch_status",
    "get_listing_content_queue",
    "get_translation_queue",
  ]);
  for (const name of ["edit_listing_content", "bulk_update_listing_status", "save_translation_draft"]) {
    assert.equal(editorTools.includes(name), false, `${name} must not register on ephemeral runtimes`);
  }

  const brokerTools = await listTools(masked, { authorization: `Bearer ${BROKER_TOKEN}` });
  for (const name of brokerTools) {
    assert.equal(/queue_reviewed_reply|run_operator_workflow/.test(name), false, `${name} is a write tool`);
  }

  const flagged = mcpConfigFromEnv({ NODE_ENV: "test", MS_REALTY_MCP_WRITES_DISABLED: "1" });
  assert.equal(flagged.writesDisabled, true);
});
