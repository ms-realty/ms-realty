import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { close, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { appendLeadContact } from "../lib/lead-contact-vault.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { FILE_BACKED_LEAD_MUTATION_PATHS, isFileBackedLeadMutationBlocked } from "../lib/lead-durable-boundary.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { dispatchHttp } from "../lib/http.mjs";
import { LEAD_OPERATIONS } from "../lib/lead-ops-durable-store.mjs";
import { saveProviderConnection } from "../lib/provider-connections.mjs";
import { providerWebhookSignature } from "../lib/provider-webhooks.mjs";
import { persistViewingDurably } from "../lib/viewing-durable-store.mjs";
import { emptyWorkspaceSettingsDocument } from "../lib/workspace-settings.mjs";
import { createProductionHttpApp, createProductionServer, productionServerConfig } from "../server.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const PROVIDER_CREDENTIAL_SECRET = "production-provider-credential-secret-32-characters";
const LEAD_CONTACT_SECRET = "production-lead-contact-secret-32-characters";
const PAYLOAD_SESSION_TOKEN = "production-server-payload-session";

function jsonlFile(directory, name, rows = []) {
  const filePath = `${directory}/${name}.jsonl`;
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

function payloadRuntime() {
  const collections = new Map();
  const docs = (collection) => {
    if (!collections.has(collection)) collections.set(collection, []);
    return collections.get(collection);
  };
  return {
    collections,
    async find({ collection, where }) {
      let rows = [...docs(collection)];
      for (const [field, condition] of Object.entries(where || {})) {
        rows = rows.filter((row) => row?.[field] === condition?.equals);
      }
      return { docs: rows };
    },
    async create({ collection, data }) {
      const document = { id: `${collection}-${docs(collection).length + 1}`, ...data };
      docs(collection).push(document);
      return document;
    },
    async update({ collection, id, data }) {
      const rows = docs(collection);
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error(`Unknown payload document: ${collection}:${id}`);
      rows[index] = { ...rows[index], ...data };
      return rows[index];
    },
  };
}

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === PAYLOAD_SESSION_TOKEN
        ? {
            principal: {
              id: "payload-server-admin",
              source: "payload_session",
              can_mutate: true,
              roles: ["admin"],
              workspace_ids: ["sandanski"],
            },
            user: { id: 1 },
          }
        : null;
    },
  };
}

function payloadSessionHeaders() {
  return {
    cookie: `ms_admin=${PAYLOAD_SESSION_TOKEN}`,
    host: "ms-realty.example",
    origin: "https://ms-realty.example",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  };
}

test("production server entrypoint serves runtime routes with env config", async () => {
  const eventLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-events-`)}/events.jsonl`;
  const consentLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-consents-`)}/consents.jsonl`;
  const auditLogPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-audit-`)}/audit-log.jsonl`;
  const operatorDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-operator-`);
  const seoEvidenceInputDir = `${operatorDir}/seo`;
  const seoEvidenceOutputPath = `${operatorDir}/seo-evidence.json`;
  const launchReadinessOutputPath = `${operatorDir}/launch-readiness.json`;
  const listingQualityReviewPath = `${operatorDir}/listing-quality.csv`;
  const redirectApprovalPath = `${operatorDir}/redirect-approvals.jsonl`;
  const deployableRedirectOutputPath = `${operatorDir}/deployable-redirects.json`;
  const localeRegistryPath = `${operatorDir}/registry.json`;
  const monitoringRollbackReportPath = `${operatorDir}/monitoring-rollback-report.json`;
  const registry = JSON.parse(fs.readFileSync(fromRoot("locales", "registry.json"), "utf8"));
  const french = registry.locales.find((locale) => locale.code === "fr");
  french.public_enabled = true;
  french.indexable = true;
  fs.writeFileSync(localeRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_path && route.planned_status === 301);
  fs.writeFileSync(
    deployableRedirectOutputPath,
    `${JSON.stringify({
      redirects: [
        {
          old_url: listing.old_url,
          source_domain: listing.source_domain,
          target_path: listing.target_path,
          status: 301,
          target_locale: listing.target_locale,
          reviewer: "operator",
          approved_at: "2026-07-06T00:00:00Z",
        },
      ],
    })}\n`,
  );
  const config = productionServerConfig({
    ...approvedPublicSeedFixtureEnv(),
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_MAX_BODY_BYTES: "4096",
    MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
    MS_REALTY_CONSENT_LEDGER_PATH: consentLedgerPath,
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
    MS_REALTY_REDIRECT_APPROVALS_PATH: redirectApprovalPath,
    MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: deployableRedirectOutputPath,
    MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessOutputPath,
    MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
    MS_REALTY_LOCALE_REGISTRY_PATH: localeRegistryPath,
    MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoEvidenceInputDir,
    MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoEvidenceOutputPath,
    MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: fromRoot("production", "data", "postgres-search-sync-report.json.example"),
    MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: fromRoot("production", "data", "postgres-search-query-report.json.example"),
    MS_REALTY_HERMES_WORKER_REPORT_PATH: fromRoot("production", "data", "hermes-draft-worker-report.json.example"),
    MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: monitoringRollbackReportPath,
  });
  assert.equal(config.port, 0);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.maxBodyBytes, 4096);
  assert.equal(config.auditLogPath, auditLogPath);
  assert.equal(config.consentLedgerPath, consentLedgerPath);
  assert.equal(config.redirectApprovalPath, redirectApprovalPath);
  assert.equal(config.deployableRedirectOutputPath, deployableRedirectOutputPath);
  assert.equal(config.launchReadinessOutputPath, launchReadinessOutputPath);
  assert.equal(config.listingQualityReviewPath, listingQualityReviewPath);
  assert.equal(config.localeRegistryPath, localeRegistryPath);
  assert.equal(config.seoEvidenceInputDir, seoEvidenceInputDir);
  assert.equal(config.seoEvidenceOutputPath, seoEvidenceOutputPath);
  assert.match(config.searchSyncReportPath, /postgres-search-sync-report\.json\.example$/);
  assert.match(config.searchQueryReportPath, /postgres-search-query-report\.json\.example$/);
  assert.match(config.hermesWorkerReportPath, /hermes-draft-worker-report\.json\.example$/);
  assert.equal(config.monitoringRollbackReportPath, monitoringRollbackReportPath);

  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  try {
    const baseUrl = `http://${address.address}:${address.port}`;
    const response = await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001");
    assert.equal(response.status, 200);
    assert.equal(response.body.kind, "listing");
    assert.equal(response.body.lang, "he");

    const frHome = await jsonFetch(baseUrl, "/fr/");
    assert.equal(frHome.status, 200);
    assert.equal(frHome.body.kind, "home");
    assert.equal(frHome.body.locale, "fr");

    const oldUrl = new URL(listing.old_url);
    const legacyRedirect = await textFetch(baseUrl, oldUrl.pathname, {
      headers: { "x-forwarded-host": oldUrl.host },
      redirect: "manual",
      captureHeaders: true,
    });
    assert.equal(legacyRedirect.status, 301);
    assert.equal(legacyRedirect.headers.location, listing.target_path);

    const seoImport = await jsonFetch(baseUrl, "/api/admin/seo-evidence/import", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        source: "search_console",
        csv: `url,clicks,impressions,position\n${listing.old_url},1,10,4\n`,
      }),
    });
    assert.equal(seoImport.status, 202);
    assert.equal(fs.existsSync(`${seoEvidenceInputDir}/search-console.csv`), true);
    assert.equal(fs.existsSync(seoEvidenceOutputPath), true);

    const redirectApproval = await jsonFetch(baseUrl, "/api/admin/redirect-approvals", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        oldUrl: listing.old_url,
        equivalentContent: true,
      }),
    });
    assert.equal(redirectApproval.status, 201);
    assert.equal(fs.existsSync(redirectApprovalPath), true);

    const redirectExport = await jsonFetch(baseUrl, "/api/admin/deployable-redirects/export", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    assert.equal(redirectExport.status, 201);
    assert.equal(fs.existsSync(deployableRedirectOutputPath), true);

    const readinessExport = await jsonFetch(baseUrl, "/api/admin/launch-readiness/export", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    assert.equal(readinessExport.status, 201);
    assert.equal(fs.existsSync(launchReadinessOutputPath), true);

    const readiness = await jsonFetch(baseUrl, "/api/admin/launch-readiness", {
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
    assert.equal(readiness.body.blockers.includes("listing_quality_review"), false);
    assert.equal(readiness.body.blockers.includes("live_services"), true);
    assert.equal(
      readiness.body.gates.find((gate) => gate.id === "monitoring_rollback").evidence.machine_evidence.path,
      monitoringRollbackReportPath,
    );
    const ready = await jsonFetch(baseUrl, "/api/ready");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.blocked_gates.some((gate) => gate.id === "monitoring_rollback"), true);
    const auditRows = readAuditLog(auditLogPath);
    assert.equal(assertAuditLog(auditRows), true);
    assert.deepEqual(
      auditRows.reduce((counts, row) => {
        counts[row.action] = (counts[row.action] || 0) + 1;
        return counts;
      }, {}),
      {
        seo_evidence_imported: 1,
        redirect_approval_created: 1,
        deployable_redirects_exported: 1,
        launch_readiness_exported: 1,
      },
    );
  } finally {
    await close(server);
  }
});

test("production server config prefers explicit MS Realty env and rejects ambiguous numbers", () => {
  const config = productionServerConfig({
    PORT: "3000",
    HOST: "0.0.0.0",
    MS_REALTY_HOST: "127.0.0.1",
    MS_REALTY_PORT: "8080",
    MS_REALTY_MAX_BODY_BYTES: "1024",
    MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "true",
    MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true",
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_LEAD_CONTACT_KEY: "test-only-production-contact-key-32-characters",
    MS_REALTY_PUBLIC_ORIGIN: "https://ms-realty.example",
    MS_REALTY_PROVIDER_TOKEN_KEY: PROVIDER_CREDENTIAL_SECRET,
    MS_REALTY_GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    MS_REALTY_META_APP_ID: "123456789012345",
    MS_REALTY_META_APP_SECRET: "meta-app-secret-at-least-sixteen",
    MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID: "987654321098765",
    MS_REALTY_META_GRAPH_VERSION: "v22.0",
    MS_REALTY_META_WEBHOOK_VERIFY_TOKEN: "meta-webhook-verify-token-at-least-24",
    MS_REALTY_PROVIDER_WEBHOOK_RECEIVED_AT: "2026-08-13T17:00:00.000Z",
    MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH: "/tmp/r2-media-coverage-report.json",
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    PAYLOAD_SECRET: "test-payload-secret",
    DATABASE_URL: "postgres://payload:payload@127.0.0.1:5432/payload",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.maxBodyBytes, 1024);
  assert.equal(config.realtyCaseRequestProjectionEnabled, true);
  assert.equal(config.realtyCasePayloadAuthorityEnabled, true);
  assert.equal(config.realtyCaseWorkspaceId, "workspace-sandanski");
  assert.equal(config.realtyCasePayloadRuntimeConfigured, true);
  assert.equal(config.leadDurableStore.leadDurableStoreEnabled, true);
  assert.equal(config.leadDurableStore.payloadSecret, "test-payload-secret");
  assert.equal(config.leadDurableStore.databaseUrl, "postgres://payload:payload@127.0.0.1:5432/payload");
  assert.equal(config.leadDurableStore.contactSecret, "test-only-production-contact-key-32-characters");
  assert.equal(config.viewingDurableStore.viewingDurableStoreEnabled, true);
  assert.equal(config.viewingDurableStore.payloadSecret, "test-payload-secret");
  assert.equal(config.viewingDurableStore.databaseUrl, "postgres://payload:payload@127.0.0.1:5432/payload");
  assert.equal(config.viewingDurableStore.contactSecret, "test-only-production-contact-key-32-characters");
  assert.equal(config.viewingDurableStore.workspaceId, "workspace-sandanski");
  assert.equal(config.providerConnection.publicOrigin, "https://ms-realty.example");
  assert.equal(config.providerConnection.credentialSecret, PROVIDER_CREDENTIAL_SECRET);
  assert.equal(config.providerConnection.googleClientId, "google-client-id");
  assert.equal(config.providerConnection.googleClientSecret, "google-client-secret");
  assert.equal(config.providerConnection.metaAppSecret, "meta-app-secret-at-least-sixteen");
  assert.equal(config.providerConnection.metaWebhookVerifyToken, "meta-webhook-verify-token-at-least-24");
  assert.equal(config.providerConnection.metaGraphVersion, "v22.0");
  assert.equal(config.providerWebhookReceivedAt, "2026-08-13T17:00:00.000Z");
  assert.equal(config.r2MediaCoverageReportPath, "/tmp/r2-media-coverage-report.json");
  assert.equal(config.leadDurableStore.workspaceId, "workspace-sandanski");
  assert.equal(productionServerConfig({}).localeRegistryPath, undefined);
  assert.equal(productionServerConfig({ HOST: "" }).host, "127.0.0.1");
  assert.throws(() => productionServerConfig({ HOST: " 127.0.0.1" }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ MS_REALTY_HOST: "127.0.0.1 " }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ PORT: " 0" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_PORT: "3000.5" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "0" }), /positive integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "64kb" }), /positive integer/);
});

test("production server HTTP app forwards provider runtimes and durable viewing payloads to standalone routes", async (t) => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-http-runtime-`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const lead = {
    lead_id: "production-provider-lead",
    received_at: "2026-08-13T14:00:00.000Z",
    source: "website_listing_detail",
    lead_type: "buyer",
    listing_reference: "MS-CRAWL-0001",
    original_language: "bg",
    admin_locale: "bg",
    contact_preference: "email",
  };
  const payload = payloadRuntime();
  const config = {
    leadLedgerPath: jsonlFile(directory, "leads", [lead]),
    leadAssignmentLedgerPath: jsonlFile(directory, "lead-assignments"),
    leadPipelineOutcomeLedgerPath: jsonlFile(directory, "lead-pipeline-outcomes"),
    leadContactVaultPath: jsonlFile(directory, "lead-contacts"),
    leadContactKey: LEAD_CONTACT_SECRET,
    replyOutboxPath: jsonlFile(directory, "replies"),
    replyDeliveryOutcomeLedgerPath: jsonlFile(directory, "reply-delivery"),
    auditLogPath: jsonlFile(directory, "audit"),
    viewingLedgerPath: jsonlFile(directory, "viewings"),
    viewingFollowUpLedgerPath: jsonlFile(directory, "viewing-follow-ups"),
    dealLedgerPath: jsonlFile(directory, "deals"),
    sellerPipelinePath: jsonlFile(directory, "seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: jsonlFile(directory, "seller-pipeline-outcomes"),
    savedSearchLedgerPath: jsonlFile(directory, "saved-searches"),
    languageRequestPath: jsonlFile(directory, "language-requests"),
    publicRequestOutcomeLedgerPath: jsonlFile(directory, "public-request-outcomes"),
    translationLedgerPath: jsonlFile(directory, "translations"),
    providerConnection: {
      publicOrigin: "https://ms-realty.example",
      credentialSecret: PROVIDER_CREDENTIAL_SECRET,
      payloadSecret: "payload-secret",
      databaseUrl: "postgres://payload.example/ms_realty",
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      metaAppSecret: "meta-webhook-app-secret-at-least-16",
      metaWebhookVerifyToken: "meta-webhook-verify-token-at-least-24",
      webhookMaxBytes: 1024 * 1024,
    },
    providerConnectionPayload: payload,
    providerWebhookPayload: payload,
    providerWebhookReceivedAt: "2026-08-13T17:00:00.000Z",
    payloadAdminAuth: payloadAdminAuth(),
    providerFetch: async (input) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "google-access-token",
            scope: "https://www.googleapis.com/auth/gmail.send",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        return new Response(JSON.stringify({ id: "gmail-message-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected provider fetch URL: ${url}`);
    },
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "payload-secret",
      databaseUrl: "postgres://payload.example/ms_realty",
      contactSecret: LEAD_CONTACT_SECRET,
      workspaceId: "workspace-sandanski",
    },
    viewingDurablePayload: payload,
    readViewingTripRequestsDurably: async () => [],
    readViewingTripContactsDurably: async () => new Map(),
  };

  appendLeadContact(
    {
      lead: { id: lead.lead_id, contact: { email: "buyer@example.test" } },
      message_original: "Private lead message that must stay in the vault.",
      contact_preference: "email",
    },
    {
      filePath: config.leadContactVaultPath,
      secret: LEAD_CONTACT_SECRET,
      storedAt: lead.received_at,
    },
  );

  await saveProviderConnection(
    {
      provider: "google",
      status: "connected",
      accountLabel: "owner@example.com",
      externalAccountId: "google-account-1",
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      metadata: {},
      credentials: { refresh_token: "google-refresh-token" },
    },
    {
      connectedBy: "payload-1",
      credentialSecret: PROVIDER_CREDENTIAL_SECRET,
      payload,
      verifiedAt: "2026-08-13T16:00:00.000Z",
    },
  );
  await saveProviderConnection(
    {
      provider: "whatsapp",
      status: "connected",
      accountLabel: "MS Realty WhatsApp",
      externalAccountId: "waba-1",
      scopes: ["whatsapp_business_messaging"],
      metadata: {},
      credentials: { access_token: "meta-access-token", waba_id: "waba-1", phone_number_id: "phone-1" },
    },
    {
      connectedBy: "payload-1",
      credentialSecret: PROVIDER_CREDENTIAL_SECRET,
      payload,
      verifiedAt: "2026-08-13T16:05:00.000Z",
    },
  );
  await persistViewingDurably(
    {
      id: "durable-viewing-1",
      lead_id: lead.lead_id,
      listing_reference: lead.listing_reference,
      original_language: "bg",
      admin_locale: "bg",
      broker: "broker_bg",
      starts_at: "2026-08-20T10:00:00.000Z",
      booked_at: "2026-08-13T15:00:00.000Z",
      channel: "property_viewing",
      status: "booked",
      follow_up_task: {
        id: "follow-up-durable-viewing-1",
        owner: "broker_bg",
        status: "open",
        due_at: "2026-08-20T10:30:00.000Z",
      },
      feedback_request: {
        id: "feedback-durable-viewing-1",
        owner: "broker_bg",
        status: "open",
        due_at: "2026-08-20T11:00:00.000Z",
        channel: "email",
      },
    },
    { payload },
  );

  const app = createProductionHttpApp(config);

  const webhookBody =
    '{\n  "object": "whatsapp_business_account",\n  "entry": [{"id":"waba-1","changes":[{"value":{"metadata":{"phone_number_id":"phone-1"}}}]}]\n}\n';
  const webhook = await dispatchHttp(app, {
    method: "POST",
    url: "/api/webhooks/whatsapp",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": providerWebhookSignature(config.providerConnection.metaAppSecret, webhookBody, { whatsapp: true }),
    },
    body: webhookBody,
  });
  assert.equal(webhook.status, 200);
  assert.deepEqual(webhook.body, { kind: "provider_webhook_accepted", idempotent: false });
  assert.equal(payload.collections.get("provider_webhook_events").length, 1);
  assert.equal(payload.collections.get("provider_webhook_events")[0].received_at, "2026-08-13T17:00:00.000Z");

  const delivery = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: payloadSessionHeaders(),
    body: {
      leadId: lead.lead_id,
      reviewedReply: "Approved reply for direct provider delivery.",
      idempotencyKey: "delivery-google-standalone-1",
      provider: "google",
    },
  });
  assert.equal(delivery.status, 201);
  assert.equal(delivery.body.provider_delivery.external_message_id, "gmail-message-1");
  assert.equal(payload.collections.get("provider_delivery_receipts").length, 1);
  assert.equal(payload.collections.get("provider_delivery_receipts")[0].lead_id, lead.lead_id);

  const viewings = await dispatchHttp(app, {
    url: "/api/admin/viewings",
    headers: payloadSessionHeaders(),
  });
  assert.equal(viewings.status, 200);
  assert.equal(viewings.body.kind, "admin_viewings");
  assert.equal(viewings.body.summary.viewings, 1);
  assert.equal(viewings.body.viewings[0].id, "durable-viewing-1");
  assert.equal(viewings.body.viewings[0].listing_reference, "MS-CRAWL-0001");
});

test("production server routes seller intake through one durable write with zero JSONL side effects", async (t) => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-production-durable-lead-`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const paths = {
    consent: `${directory}/consents.jsonl`,
    contact: `${directory}/contacts.jsonl`,
    event: `${directory}/events.jsonl`,
    lead: `${directory}/leads.jsonl`,
    seller: `${directory}/seller-pipeline.jsonl`,
  };
  const receivedAt = "2026-08-13T08:00:00.000Z";
  const sellerPipelineCreatedAt = "2026-08-13T08:00:01.000Z";
  const contactSecret = "production-route-contact-key-32-characters-minimum";
  const config = productionServerConfig({
    ...approvedPublicSeedFixtureEnv(),
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_CONSENT_LEDGER_PATH: paths.consent,
    MS_REALTY_EVENT_LEDGER_PATH: paths.event,
    MS_REALTY_LEAD_CONTACT_VAULT_PATH: paths.contact,
    MS_REALTY_LEAD_LEDGER_PATH: paths.lead,
    MS_REALTY_SELLER_PIPELINE_PATH: paths.seller,
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_LEAD_CONTACT_KEY: contactSecret,
    MS_REALTY_RECEIVED_AT: receivedAt,
    MS_REALTY_SELLER_PIPELINE_CREATED_AT: sellerPipelineCreatedAt,
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    PAYLOAD_SECRET: "p".repeat(40),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  });
  const calls = [];
  config.persistLeadIntake = async (input) => {
    calls.push(input);
    assert.equal(input.contactSecret, contactSecret);
    assert.equal(input.marketingOptIn, true);
    assert.equal(input.receivedAt, receivedAt);
    assert.equal(input.sellerPipelineCreatedAt, sellerPipelineCreatedAt);
    assert.equal(input.workspaceId, "workspace-sandanski");
    assert.equal(input.lead.lead.leadType, "seller");
    const leadId = input.lead.lead.id;
    return {
      lead: { lead_id: leadId, received_at: receivedAt, source: input.lead.lead.source, lead_type: "seller" },
      contactVault: { lead_id: leadId, stored_at: receivedAt, encrypted: true, durable: true },
      consent: { consent_type: "inquiry_follow_up", subject_id: leadId, marketing_opt_in: true },
      sellerPipeline: { id: `seller-pipeline-${leadId}`, lead_id: leadId, created_at: sellerPipelineCreatedAt },
      created: true,
      idempotent: false,
    };
  };
  config.readWorkspaceSettingsDurably = async () => emptyWorkspaceSettingsDocument();

  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  const baseUrl = `http://${address.address}:${address.port}`;
  try {
    const response = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      headers: { origin: baseUrl },
      body: JSON.stringify({
        source: "website_seller_valuation",
        leadType: "seller",
        language: "bg",
        contact: { name: "Durable Seller", phone: "+359000000000" },
        contact_preference: "phone",
        property: { location: "Sandanski", type: "apartment" },
        message: "Please arrange a valuation.",
        marketingOptIn: true,
      }),
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(calls.length, 1);
    assert.equal(response.body.contactVault.durable, true);
    assert.equal(response.body.consent.marketing_opt_in, true);
    assert.equal(response.body.sellerPipeline.created_at, sellerPipelineCreatedAt);
    for (const [kind, filePath] of Object.entries(paths)) {
      assert.equal(fs.existsSync(filePath), false, `durable production intake must not create ${kind} JSONL`);
    }
  } finally {
    await close(server);
  }
});

test("production server forwards durable lead-operation and viewing readers into the admin inbox", async () => {
  const config = productionServerConfig({
    ...approvedPublicSeedFixtureEnv(),
    NODE_ENV: "production",
    MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_LEAD_CONTACT_KEY: LEAD_CONTACT_SECRET,
    MS_REALTY_WORKSPACE_ID: "sandanski",
    PAYLOAD_SECRET: "p".repeat(40),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  });
  config.payloadAdminAuth = payloadAdminAuth();
  config.readLeadIntakes = async () => [
    {
      lead_id: "server-forwarded-lead",
      source: "website_listing_detail",
      intent: "inquiry",
      lead_type: "buyer",
      listing_reference: "MS-CRAWL-0001",
      original_language: "bg",
      admin_locale: "bg",
      contact_preference: "email",
      received_at: "2026-08-13T08:00:00.000Z",
      assigned_broker: "broker_bg",
      assignment_method: "rules",
      sla_due_at: "2026-08-13T08:15:00.000Z",
      intake_completion: { complete: false, missing_fields: [], captured_fields: [] },
      contact: { name: "Server Durable", email: "server-durable@example.invalid" },
    },
  ];
  config.readLeadOperationsDurably = async ({ operation }) => {
    if (operation === LEAD_OPERATIONS.assignment) {
      return [
        {
          id: "assignment-forwarded-1",
          lead_id: "server-forwarded-lead",
          broker_id: "broker_ru",
          actor: "payload-server-admin",
          reason: "Russian-speaking buyer",
          recorded_at: "2026-08-13T08:01:00.000Z",
        },
      ];
    }
    if (operation === LEAD_OPERATIONS.snooze) {
      return [
        {
          id: "snooze-forwarded-1",
          lead_id: "server-forwarded-lead",
          action: "snooze",
          reason: "Waiting for callback time",
          until: "2026-09-20T08:00:00.000Z",
          actor: "payload-server-admin",
          recorded_at: "2026-08-13T08:02:00.000Z",
        },
      ];
    }
    return [];
  };
  config.readSellerPipelineItemsDurably = async () => [];
  config.readViewingsDurably = async () => [
    {
      id: "server-forwarded-viewing",
      lead_id: "server-forwarded-lead",
      listing_reference: "MS-CRAWL-0001",
      broker: "broker_ru",
      status: "booked",
      booked_at: "2026-08-13T08:10:00.000Z",
      starts_at: "2026-08-13T09:00:00.000Z",
      original_language: "bg",
      admin_locale: "bg",
    },
  ];
  config.readViewingTripRequestsDurably = async () => [];
  config.readViewingTripContactsDurably = async () => new Map();

  const app = createProductionHttpApp(config);
  const response = await dispatchHttp(app, {
    url: "/api/admin/leads",
    headers: payloadSessionHeaders(),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.runtime_data_mode, "durable_only");
  assert.equal(response.body.leadOperations.snoozeWritable, true);
  assert.equal(response.body.leadOperations.bulkWritable, true);
  assert.equal(response.body.leads[0].assigned_broker, "broker_ru");
  assert.equal(response.body.viewings[0].id, "server-forwarded-viewing");
  assert.equal(response.body.leadSla.rows[0].snooze.status, "active");
});

test("production server blocks every file-backed lead mutation while durable intake is enabled", async (t) => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-production-durable-read-only-`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const guardedPaths = [
    "/api/admin/replies",
    "/api/admin/replies/delivery",
    "/api/admin/lead-pipeline/outcome",
    "/api/admin/leads",
    "/api/admin/leads/assign",
    "/api/admin/leads/snooze",
    "/api/admin/leads/unsnooze",
    "/api/admin/leads/bulk",
    "/api/admin/accounts",
    "/api/admin/accounts/link",
    "/api/admin/documents/outcome",
    "/api/admin/consents/withdraw",
    "/api/admin/replies/draft",
    "/api/admin/viewings",
    "/api/admin/viewings/follow-up",
    "/api/admin/seller-pipeline/outcome",
    "/api/admin/deals/close",
  ];
  assert.deepEqual([...FILE_BACKED_LEAD_MUTATION_PATHS], guardedPaths, "both runtime adapters must guard the same exact surface");
  const boundary = { durableStore: { leadDurableStoreEnabled: true }, method: "POST" };
  assert.equal(isFileBackedLeadMutationBlocked({ ...boundary, pathname: "/api/admin/replies" }), true);
  assert.equal(
    isFileBackedLeadMutationBlocked({
      ...boundary,
      pathname: "/api/admin/replies/delivery",
      durableProviderDelivery: true,
    }),
    false,
  );
  assert.equal(
    isFileBackedLeadMutationBlocked({ ...boundary, pathname: "/api/admin/viewings", durableViewing: true }),
    false,
  );
  assert.equal(
    isFileBackedLeadMutationBlocked({ ...boundary, pathname: "/api/admin/viewings/follow-up", durableViewing: true }),
    false,
  );

  const files = {
    account: `${directory}/accounts.jsonl`,
    audit: `${directory}/audit.jsonl`,
    consent: `${directory}/consents.jsonl`,
    contact: `${directory}/contacts.jsonl`,
    deal: `${directory}/deals.jsonl`,
    document: `${directory}/documents.jsonl`,
    event: `${directory}/events.jsonl`,
    lead: `${directory}/leads.jsonl`,
    leadAssignment: `${directory}/lead-assignments.jsonl`,
    leadPipelineOutcome: `${directory}/lead-pipeline-outcomes.jsonl`,
    reply: `${directory}/replies.jsonl`,
    replyDelivery: `${directory}/reply-delivery.jsonl`,
    seller: `${directory}/seller-pipeline.jsonl`,
    sellerOutcome: `${directory}/seller-outcomes.jsonl`,
    viewing: `${directory}/viewings.jsonl`,
    viewingFollowUp: `${directory}/viewing-follow-ups.jsonl`,
  };
  const config = productionServerConfig({
    ...approvedPublicSeedFixtureEnv(),
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_ACCOUNT_LEDGER_PATH: files.account,
    MS_REALTY_AUDIT_LOG_PATH: files.audit,
    MS_REALTY_CONSENT_LEDGER_PATH: files.consent,
    MS_REALTY_DEAL_LEDGER_PATH: files.deal,
    MS_REALTY_DOCUMENT_CHECKLIST_LEDGER_PATH: files.document,
    MS_REALTY_EVENT_LEDGER_PATH: files.event,
    MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH: files.leadAssignment,
    MS_REALTY_LEAD_CONTACT_VAULT_PATH: files.contact,
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_LEAD_LEDGER_PATH: files.lead,
    MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH: files.leadPipelineOutcome,
    MS_REALTY_REPLY_DELIVERY_OUTCOME_LEDGER_PATH: files.replyDelivery,
    MS_REALTY_REPLY_OUTBOX_PATH: files.reply,
    MS_REALTY_SELLER_PIPELINE_OUTCOME_LEDGER_PATH: files.sellerOutcome,
    MS_REALTY_SELLER_PIPELINE_PATH: files.seller,
    MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH: files.viewingFollowUp,
    MS_REALTY_VIEWING_LEDGER_PATH: files.viewing,
    MS_REALTY_LEAD_CONTACT_KEY: "production-read-only-contact-key-32-characters-minimum",
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    PAYLOAD_SECRET: "p".repeat(40),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  });

  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  const baseUrl = `http://${address.address}:${address.port}`;
  try {
    for (const pathname of guardedPaths) {
      const response = await jsonFetch(baseUrl, pathname, {
        method: "POST",
        headers: { authorization: "Bearer local-admin-smoke" },
        body: "{}",
      });
      assert.equal(response.status, 503, pathname);
      assert.equal(response.body.kind, "lead_store_read_only", pathname);
    }
    for (const [kind, filePath] of Object.entries(files)) {
      assert.equal(fs.existsSync(filePath), false, `blocked durable-mode mutations must not create ${kind} state`);
    }
  } finally {
    await close(server);
  }
});

test("production server keeps admin locale additions in memory without mounted registry path", async () => {
  const registryPath = fromRoot("locales", "registry.json");
  const originalRegistry = fs.readFileSync(registryPath, "utf8");
  const auditLogPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-locale-audit-`)}/audit-log.jsonl`;
  resetAuditLog(auditLogPath);
  const server = createProductionServer(productionServerConfig({ PORT: "0", HOST: "127.0.0.1", MS_REALTY_AUDIT_LOG_PATH: auditLogPath }));
  const address = await listen(server, 0, "127.0.0.1");
  const baseUrl = `http://${address.address}:${address.port}`;
  try {
    const created = await jsonFetch(baseUrl, "/api/admin/locales", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        code: "it",
        native_name: "Italiano",
        admin_name: "Italian",
        direction: "ltr",
        public_enabled: false,
        indexable: false,
        fallback_locale: "en",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.locale.code, "it");

    const listed = await jsonFetch(baseUrl, "/api/admin/locales", {
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.locales.some((locale) => locale.code === "it"), true);
    assert.equal(fs.readFileSync(registryPath, "utf8"), originalRegistry);
    const auditRows = readAuditLog(auditLogPath);
    assert.equal(assertAuditLog(auditRows), true);
    assert.deepEqual(auditRows.map((row) => row.action), ["locale_created"]);
  } finally {
    await close(server);
  }
});

test("production server persists public leads and reviewed admin replies", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-ledgers-`);
  const eventLedgerPath = `${dir}/events.jsonl`;
  const consentLedgerPath = `${dir}/consents.jsonl`;
  const auditLogPath = `${dir}/audit-log.jsonl`;
  const leadLedgerPath = `${dir}/leads.jsonl`;
  const replyOutboxPath = `${dir}/replies.jsonl`;
  fs.writeFileSync(eventLedgerPath, "");
  resetConsentLedger(consentLedgerPath);
  resetAuditLog(auditLogPath);
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);

  const config = productionServerConfig({
    ...approvedPublicSeedFixtureEnv(),
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
    MS_REALTY_CONSENT_LEDGER_PATH: consentLedgerPath,
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
    MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
    MS_REALTY_REPLY_OUTBOX_PATH: replyOutboxPath,
  });
  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  const baseUrl = `http://${address.address}:${address.port}`;
  try {
    const lead = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      headers: { origin: baseUrl },
      body: JSON.stringify({
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi", whatsapp: "+359880000001" },
        contact_preference: "whatsapp",
        message: "Interested in this property.",
      }),
    });
    assert.equal(lead.status, 201);
    assert.equal(lead.body.broker_assignment.broker_id, null);
    assert.equal(lead.body.broker_assignment.method, "manager_queue");
    assert.equal(readLeadLedger(leadLedgerPath).length, 1);
    assert.deepEqual(
      readConsentLedger(consentLedgerPath).map((row) => row.consent_type),
      ["inquiry_follow_up"],
    );

    const reply = await jsonFetch(baseUrl, "/api/admin/replies", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        leadId: lead.body.lead.id,
        language: "he",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_en",
        approved: true,
      }),
    });
    assert.equal(reply.status, 201);
    assert.equal(readReplyOutbox(replyOutboxPath).length, 1);
    const auditRows = readAuditLog(auditLogPath);
    assert.equal(assertAuditLog(auditRows), true);
    assert.deepEqual(auditRows.map((row) => row.action), ["reply_approved"]);
  } finally {
    await close(server);
  }
});

test("default host is loopback and non-loopback binds fail closed without production credentials", async () => {
  const { assertSafeBind, isLoopbackHost, productionServerConfig } = await import("../server.mjs");

  // Default bind is loopback — a bare start never exposes admin on all interfaces.
  assert.equal(productionServerConfig({}).host, "127.0.0.1");
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);

  // Loopback binds are always allowed.
  assert.doesNotThrow(() => assertSafeBind({ host: "127.0.0.1" }, {}));
  assert.doesNotThrow(() => assertSafeBind({ host: "localhost" }, { NODE_ENV: "development" }));

  // Non-loopback without production mode is refused.
  assert.throws(() => assertSafeBind({ host: "0.0.0.0" }, {}), /Refusing to bind/);
  // Non-loopback in production but without a credential registry is refused.
  assert.throws(
    () => assertSafeBind({ host: "0.0.0.0" }, { NODE_ENV: "production" }),
    /MS_REALTY_ADMIN_CREDENTIALS_JSON/,
  );
  // Non-loopback in production WITH a real credential registry is allowed.
  assert.doesNotThrow(() =>
    assertSafeBind(
      { host: "0.0.0.0" },
      {
        NODE_ENV: "production",
        MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
          { id: "op1", token: "safe-bind-operator-token-0123456789", roles: ["admin"] },
        ]),
      },
    ),
  );
});
