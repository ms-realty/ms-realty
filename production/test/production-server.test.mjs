import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { close, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { createProductionServer, productionServerConfig } from "../server.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

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
        reviewer: "editor_bg",
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
    assert.equal(readiness.body.blockers.includes("listing_quality_review"), true);
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
    MS_REALTY_LEAD_CONTACT_KEY: "test-only-production-contact-key-32-characters",
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
  assert.equal(productionServerConfig({}).localeRegistryPath, undefined);
  assert.equal(productionServerConfig({ HOST: "" }).host, "127.0.0.1");
  assert.throws(() => productionServerConfig({ HOST: " 127.0.0.1" }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ MS_REALTY_HOST: "127.0.0.1 " }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ PORT: " 0" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_PORT: "3000.5" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "0" }), /positive integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "64kb" }), /positive integer/);
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
    assert.equal(lead.body.broker_assignment.broker_id, "broker_international");
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
