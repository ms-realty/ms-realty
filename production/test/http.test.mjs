import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readLeadContacts } from "../lib/lead-contact-vault.mjs";
import { readPublicContacts } from "../lib/public-contact-vault.mjs";
import { assertLanguageRequests, readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertTranslationLedger, readTranslationLedger, resetTranslationLedger } from "../lib/translation-ledger.mjs";
import { assertListingEdits, readListingEdits, resetListingEdits } from "../lib/listing-edits.mjs";
import { assertViewingLedger, readViewings, resetViewingLedger } from "../lib/viewing-ledger.mjs";
import {
  assertViewingFollowUpLedger,
  readViewingFollowUps,
  resetViewingFollowUpLedger,
} from "../lib/viewing-follow-ups.mjs";
import {
  assertLeadPipelineOutcomes,
  readLeadPipelineOutcomes,
  resetLeadPipelineOutcomes,
} from "../lib/lead-pipeline-outcomes.mjs";
import { assertSavedSearches, readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { assertSellerPipeline, readSellerPipeline, resetSellerPipeline } from "../lib/seller-pipeline.mjs";
import { assertSellerPipelineOutcomes, readSellerPipelineOutcomes, resetSellerPipelineOutcomes } from "../lib/seller-pipeline-outcomes.mjs";
import { assertDealLedger, readDeals, resetDealLedger } from "../lib/deal-ledger.mjs";
import { assertBrokerContacts, readBrokerContacts, resetBrokerContacts } from "../lib/broker-contacts.mjs";
import { assertTourApprovals, readTourApprovals, resetTourApprovals } from "../lib/tours.mjs";
import { assertMediaReviews, mediaAssetId, readMediaReviews, resetMediaReviews } from "../lib/media-reviews.mjs";
import { assertLeadAssignments, readLeadAssignments, resetLeadAssignments } from "../lib/lead-assignments.mjs";
import { assertEventLedger, readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { assertConsentLedger, readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { assertSlugHistory, readSlugHistory, resetSlugHistory } from "../lib/slug-history.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  buildLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import { buildPayloadRuntimeReport } from "../lib/payload-runtime.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { signProductionRecoveryReport } from "../lib/production-recovery.mjs";
import { appendRedirectApproval } from "../lib/redirect-approvals.mjs";
import { LOGO_URL, LOGO_URL_REVERSED } from "../lib/ui/design-assets.mjs";
import {
  approvedPublicSeedFixture,
  approvedPublicSeedFixtureOptions,
  installDurableLeadStoreFixtureEnv,
} from "./approved-public-seed.fixture.mjs";

const SAME_ORIGIN_LEAD_HEADERS = Object.freeze({
  host: "localhost",
  origin: "http://localhost",
  "sec-fetch-site": "same-origin",
});
const RECOVERY_KEYPAIR = crypto.generateKeyPairSync("ed25519");
const RECOVERY_PUBLIC_KEY = RECOVERY_KEYPAIR.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function healthyHermesAgentFetch(url) {
  if (String(url).endsWith("/v1/capabilities")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        platform: "hermes-agent",
        model: "hermes-agent",
        auth: { type: "bearer", required: true },
        features: { chat_completions: true, responses_api: true, run_submission: true },
      }),
    };
  }
  return { ok: true, status: 200 };
}

function validProductionRecoveryReport(generatedAt = new Date().toISOString()) {
  const generatedAtMs = Date.parse(generatedAt);
  const minutesBefore = (minutes) => new Date(generatedAtMs - minutes * 60_000).toISOString();
  const ciphertextSha256 = "1".repeat(64);
  const manifestSha256 = "2".repeat(64);
  const restoreDrillSha256 = "3".repeat(64);
  const monitoringRollbackReportSha256 = "4".repeat(64);
  const releaseId = "a".repeat(40);
  return signProductionRecoveryReport({
    schema_version: 2,
    generated_at: generatedAt,
    environment: "production",
    ready: true,
    policy: {
      provider: "eu-backup-provider",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 30,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: "backup-20260722-001",
      completed_at: minutesBefore(40),
      checksum_verified: true,
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
      components: ["payload_postgres", "runtime_data", "runtime_evidence"],
    },
    restore_drill: {
      drill_id: "restore-20260722-001",
      source_backup_id: "backup-20260722-001",
      completed_at: minutesBefore(25),
      target: "isolated",
      status: "pass",
      checksum_verified: true,
      rollback_procedure_verified: true,
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      result_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: {
      status: "approved",
      approval_id: "recovery-approval-20260722-001",
      reviewer: "agency_owner",
      approved_at: minutesBefore(10),
      artifact_sha256: "5".repeat(64),
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      restore_drill_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
    },
  }, { privateKey: RECOVERY_KEYPAIR.privateKey });
}

function tempLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-`)}/leads.jsonl`;
  resetLeadLedger(file);
  return file;
}

function tempOutbox() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-replies-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  return file;
}

function tempLanguageRequests() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-language-`)}/requests.jsonl`;
  resetLanguageRequests(file);
  return file;
}

function tempTranslations() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-translations-`)}/translations.jsonl`;
  resetTranslationLedger(file);
  return file;
}

function tempListingEdits() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  resetListingEdits(file);
  return file;
}

function tempDefaultListingEdits() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  fs.copyFileSync(fromRoot("production", "data", "listing-edits.jsonl"), file);
  return file;
}

function tempViewings() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewings-`)}/viewings.jsonl`;
  resetViewingLedger(file);
  return file;
}

function tempViewingFollowUps() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewing-follow-ups-`)}/viewing-follow-ups.jsonl`;
  resetViewingFollowUpLedger(file);
  return file;
}

function tempLeadPipelineOutcomes() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-lead-pipeline-`)}/outcomes.jsonl`;
  resetLeadPipelineOutcomes(file);
  return file;
}

function tempSavedSearches() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-saved-searches-`)}/saved-searches.jsonl`;
  resetSavedSearches(file);
  return file;
}

function tempSellerPipeline() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-pipeline-`)}/seller-pipeline.jsonl`;
  resetSellerPipeline(file);
  return file;
}

function tempSellerPipelineOutcomes() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-pipeline-outcomes-`)}/seller-pipeline-outcomes.jsonl`;
  resetSellerPipelineOutcomes(file);
  return file;
}

function tempDeals() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deals-`)}/deals.jsonl`;
  resetDealLedger(file);
  return file;
}

function tempBrokerContacts() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-broker-contacts-`)}/broker-contacts.jsonl`;
  resetBrokerContacts(file);
  return file;
}

function tempTourApprovals() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-tour-approvals-`)}/tour-approvals.jsonl`;
  resetTourApprovals(file);
  return file;
}

function tempMediaReviews() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-media-reviews-`)}/media-reviews.jsonl`;
  resetMediaReviews(file);
  return file;
}

function tempLeadAssignments() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-lead-assignments-`)}/lead-assignments.jsonl`;
  resetLeadAssignments(file);
  return file;
}

function tempEvents() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-events-`)}/events.jsonl`;
  resetEventLedger(file);
  return file;
}

function tempConsents() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-consents-`)}/consents.jsonl`;
  resetConsentLedger(file);
  return file;
}

function tempAuditLog() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-audit-`)}/audit-log.jsonl`;
  resetAuditLog(file);
  return file;
}

function tempSlugHistory() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-slug-history-`)}/slug-history.jsonl`;
  resetSlugHistory(file);
  return file;
}

function tempRedirectApprovals() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-redirect-approvals-`)}/redirect-approvals.jsonl`;
}

function tempDeployableRedirects() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deployable-redirects-`)}/deployable-redirects.json`;
}

function tempSeoEvidenceDir() {
  return fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-evidence-`);
}

function tempListingQualityReviewPath() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-review-`)}/listing-quality.csv`;
}

function tempRegistry() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-locales-`)}/registry.json`;
  fs.writeFileSync(file, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
  return file;
}

function hermesDraftOutput(propertyFacts, targetLocale = "el") {
  const factText = Object.values(propertyFacts)
    .filter((value) => ["string", "number"].includes(typeof value))
    .map(String)
    .filter(Boolean)
    .join(" ");
  return {
    title: `${propertyFacts.id} ${propertyFacts.location} ${targetLocale}`,
    body: `${factText} reviewed ${targetLocale} translation draft`,
    seo_title: `${propertyFacts.id} ${propertyFacts.location}`,
    meta_description: `${factText} reviewed ${targetLocale} translation draft for approved MS Realty listing content.`,
    citations: [{ source: "cms", field: "title" }],
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function completeListingQualityReviewCsv(workbookCsv, limit = null) {
  const headers = [
    "listing_id",
    "price_eur",
    "area_sqm",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const workbookRows = parseCsv(workbookCsv);
  const reviewRows = limit === null ? workbookRows : workbookRows.slice(0, limit);
  const rows = reviewRows.map((row) => {
    const fields = (row.required_editor_fields || "").split("|").filter(Boolean);
    const needsFacts = fields.some((field) => ["price_eur", "area_sqm", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) => ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field));
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("area_sqm") ? row.area_sqm || 85 : "",
      fields.includes("bedrooms") ? row.bedrooms || 2 : "",
      fields.includes("location") ? row.location || "Sandanski" : "",
      fields.includes("description") ? "Reviewed listing description" : "",
      needsFacts ? "editor_bg" : "",
      needsMedia ? "media_editor" : "",
      "Reviewed source gallery evidence from admin listing-quality workbook",
      row.editor_path,
      row.review_status,
      row.issues,
      row.required_editor_fields,
      row.public_gallery_assets,
      row.public_gallery_sample,
      row.missing_alt_text_assets,
    ]
      .map(csvCell)
      .join(",");
  });
  return `${[headers.join(","), ...rows].join("\n")}\n`;
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

function actionCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.action] = (counts[row.action] || 0) + 1;
    return counts;
  }, {});
}

test("HTTP search previews do not pollute search analytics", async () => {
  const eventLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-preview-events-`)}/events.jsonl`;
  resetEventLedger(eventLedgerPath);
  const app = createHttpApp({ eventLedgerPath });

  const preview = await dispatchHttp(app, {
    url: "/api/search?locale=he&municipality=Sandanski",
    headers: { "x-ms-realty-preview": "search-count" },
  });
  const search = await dispatchHttp(app, { url: "/api/search?locale=he&municipality=Sandanski" });

  assert.equal(preview.status, 200);
  assert.equal(search.status, 200);
  assert.deepEqual(readEventLedger(eventLedgerPath).map((event) => event.type), ["search"]);
});

test("HTTP app serves only optimized local hero assets", async () => {
  const app = createHttpApp();
  const hero = await dispatchHttp(app, { url: "/hero/sandanski-640.avif" });
  const disallowed = await dispatchHttp(app, { url: "/hero/sandanski.svg" });

  assert.equal(hero.status, 200);
  assert.equal(hero.headers["content-type"], "image/avif");
  // Long-lived but bustable: hero filenames encode a crop width, not a content
  // hash, so replacing a photograph reuses its URL and `immutable` would strand
  // the old bytes in browsers.
  assert.equal(hero.headers["cache-control"], "public, max-age=604800, stale-while-revalidate=86400");
  assert.equal(Buffer.isBuffer(hero.body), true);
  assert.ok(hero.body.length > 0);
  assert.equal(disallowed.status, 404);
});

test("HTTP app serves generated logo assets as immutable binary PNGs", async () => {
  const app = createHttpApp();

  for (const url of [LOGO_URL, LOGO_URL_REVERSED]) {
    const logo = await dispatchHttp(app, { url });
    assert.equal(logo.status, 200);
    assert.equal(logo.headers["content-type"], "image/png");
    assert.equal(logo.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(Buffer.isBuffer(logo.body), true);
    assert.deepEqual([...logo.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("HTTP app serves bounded official bilingual geography suggestions", async () => {
  const app = createHttpApp();
  const sandanski = await dispatchHttp(app, {
    url: "/api/geography?q=Sandanski&country=BG&level=settlement&limit=5",
  });
  const thessaloniki = await dispatchHttp(app, {
    url: "/api/geography?q=Thessaloniki&country=GR&level=settlement&limit=5",
  });

  assert.equal(sandanski.status, 200);
  assert.equal(sandanski.headers["cache-control"], "public, max-age=3600, stale-while-revalidate=86400");
  assert.equal(sandanski.body.returned <= 5, true);
  assert.equal(sandanski.body.results[0].id, "BG:settlement:65334");
  assert.equal(sandanski.body.results[0].context.some((area) => area.official_code === "BLG40"), true);
  assert.equal(thessaloniki.body.results[0].id, "GR:settlement:EL52:0701010001");
  assert.equal(thessaloniki.body.results[0].active_market, true);
});

test("HTTP app serves listing, search, fallback, and lead JSON contracts", async (t) => {
  installDurableLeadStoreFixtureEnv(t);
  const leadLedgerPath = tempLedger();
  const leadAssignmentLedgerPath = tempLeadAssignments();
  const leadContactVaultPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-contacts-`)}/contacts.jsonl`;
  const leadContactKey = "test-only-http-contact-key-32-characters-minimum";
  const publicContactVaultPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-public-contacts-`)}/contacts.jsonl`;
  const publicContactKey = "test-only-http-public-contact-key-32-characters";
  const replyOutboxPath = tempOutbox();
  const languageRequestPath = tempLanguageRequests();
  const translationLedgerPath = tempTranslations();
  const listingEditLedgerPath = tempListingEdits();
  const viewingLedgerPath = tempViewings();
  const viewingFollowUpLedgerPath = tempViewingFollowUps();
  const leadPipelineOutcomeLedgerPath = tempLeadPipelineOutcomes();
  const savedSearchLedgerPath = tempSavedSearches();
  const sellerPipelinePath = tempSellerPipeline();
  const dealLedgerPath = tempDeals();
  const brokerContactLedgerPath = tempBrokerContacts();
  const tourApprovalLedgerPath = tempTourApprovals();
  const mediaReviewLedgerPath = tempMediaReviews();
  const eventLedgerPath = tempEvents();
  const consentLedgerPath = tempConsents();
  const auditLogPath = tempAuditLog();
  const accountLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-accounts-`)}/accounts.jsonl`;
  const documentChecklistLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-documents-`)}/outcomes.jsonl`;
  const slugHistoryPath = tempSlugHistory();
  const hermesReplyPrompts = [];
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    // This integration fixture exercises the legacy file adapter. The
    // process-level durable env above is only for the public UI contract.
    leadDurableStore: { leadDurableStoreEnabled: false },
    payloadListingEnv: {},
    leadLedgerPath,
    leadAssignmentLedgerPath,
    leadContactVaultPath,
    leadContactKey,
    publicContactVaultPath,
    publicContactKey,
    replyOutboxPath,
    languageRequestPath,
    translationLedgerPath,
    listingEditLedgerPath,
    viewingLedgerPath,
    viewingFollowUpLedgerPath,
    leadPipelineOutcomeLedgerPath,
    savedSearchLedgerPath,
    sellerPipelinePath,
    dealLedgerPath,
    brokerContactLedgerPath,
    tourApprovalLedgerPath,
    mediaReviewLedgerPath,
    eventLedgerPath,
    consentLedgerPath,
    auditLogPath,
    accountLedgerPath,
    documentChecklistLedgerPath,
    slugHistoryPath,
    receivedAt: "2026-07-04T00:00:00Z",
    requestedAt: "2026-07-04T00:01:00Z",
    editedAt: "2026-07-04T00:03:00Z",
    reviewedAt: "2026-07-04T00:05:00Z",
    bookedAt: "2026-07-04T00:06:00Z",
    leadPipelineOutcomeAt: "2026-07-04T00:05:30Z",
    viewingFollowUpAt: "2026-07-06T12:00:00Z",
    savedAt: "2026-07-04T00:07:00Z",
    sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
    dealClosedAt: "2026-07-10T10:00:00Z",
    slugChangedAt: "2026-07-04T00:09:00Z",
    leadSlaGeneratedAt: "2026-07-06T00:00:00Z",
    search: {
      postgres: { env: {} },
    },
    hermesReplyProvider: async (prompt) => {
      hermesReplyPrompts.push(prompt);
      return {
        text: "MS-CRAWL-0001 Sandanski reply draft for broker review.",
        language: prompt.language,
        citations: [{ source: "listing", field: "id" }],
      };
    },
  });
  const redirect = deployableRedirect();
  const leadResponse = await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      headers: SAME_ORIGIN_LEAD_HEADERS,
      body: {
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi", whatsapp: "+359880000001" },
        contact_preference: "whatsapp",
        message: "Interested in this property.",
      },
    });
  const viewingLeadResponse = await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      headers: SAME_ORIGIN_LEAD_HEADERS,
      body: {
        source: "website_viewing_request",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi", phone: "+359880000001" },
        contact_preference: "phone",
        request_details: { viewing_date: "2026-07-20", viewing_time: "14:00" },
        message: "I would like to view this property.",
      },
    });
  const contactLeadResponse = await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      headers: SAME_ORIGIN_LEAD_HEADERS,
      body: {
        source: "website_contact_callback",
        leadType: "general",
        language: "he",
        contact: { name: "Noa Levi", phone: "+359880000001" },
        contact_preference: "phone",
        request_details: { callback_time: "Weekdays after 14:00" },
        message: "Please call me about buying in Sandanski.",
      },
    });
  const sellerLeadResponse = await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      headers: SAME_ORIGIN_LEAD_HEADERS,
      body: {
        source: "website_seller_valuation",
        leadType: "seller",
        language: "el",
        contact: { name: "Nikos Papadopoulos", phone: "+359880000002" },
        property: { location: "Sandanski", type: "apartment" },
        message: "I want a valuation for my property.",
      },
    });
  // Public intake mints its own ids; correlate downstream steps by what the
  // server actually assigned rather than by a fixture string.
  const leadId = leadResponse.body.lead.id;
  const viewingLeadId = viewingLeadResponse.body.lead.id;
  const contactLeadId = contactLeadResponse.body.lead.id;

  const smoke = {
    health: await dispatchHttp(app, { url: "/api/health" }),
    ready: await dispatchHttp(app, { url: "/api/ready" }),
    legacyRedirect: await dispatchHttp(app, { url: redirect.old_url }),
    home: await dispatchHttp(app, { url: "/he/" }),
    homeHtml: await dispatchHttp(app, { url: "/he/?format=html" }),
    listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    listingHtml: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?format=html" }),
    listingPrint: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?print=1" }),
    brokerContact: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/broker-contacts",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        id: "broker-contact-test",
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: "+447700900001",
        reviewer: "owner",
        sourceReference: "test://broker-contact/MS-CRAWL-0001",
        validationStatus: "broker_verified",
        approved: true,
      },
    }),
    listingAfterBrokerContact: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    tourApproval: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/tours/approve",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        id: "tour-approval-test",
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/MS-CRAWL-0001.jpg",
        accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
        reviewer: "media_editor",
        reviewConfirmed: true,
      },
    }),
    listingAfterTourApproval: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    listingHtmlAfterTourApproval: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?format=html" }),
    slugChange: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/slug",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        id: "slug-change-http-test",
        listingId: "MS-CRAWL-0001",
        locale: "he",
        oldPath: "/he/properties/old-sandanski-slug",
        editor: "editor_bg",
      },
    }),
    slugChangeUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/slug",
      body: {
        listingId: "MS-CRAWL-0001",
        locale: "he",
        oldPath: "/he/properties/no-auth-old-slug",
        editor: "editor_bg",
      },
    }),
    slugRedirect: await dispatchHttp(app, { url: "/he/properties/old-sandanski-slug" }),
    search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
    searchPriceAsc: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski&sort=price_asc" }),
    searchHtml: await dispatchHttp(app, { url: "/he/search?format=html&q=Sandanski" }),
    searchHtmlPriceDesc: await dispatchHttp(app, { url: "/he/search?format=html&q=Sandanski&sort=price_desc" }),
    location: await dispatchHttp(app, { url: "/he/locations/sandanski" }),
    locationHtml: await dispatchHttp(app, { url: "/he/locations/sandanski?format=html" }),
    searchFiltered: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski&property_type=apartment" }),
    fallback: await dispatchHttp(app, { url: "/fr/" }),
    languageRequest: await dispatchHttp(app, {
      method: "POST",
      url: "/api/language-requests",
      body: {
        id: "http-language-request-test",
        requestedLocale: "fr",
        requestedPath: "/fr/",
        contact: { name: "Claire Martin", email: "claire@example.test" },
        message: "Please notify me when French property pages are reviewed.",
      },
    }),
    savedSearch: await dispatchHttp(app, {
      method: "POST",
      url: "/api/saved-searches",
      body: {
        id: "http-saved-search-test",
        locale: "he",
        query: "Sandanski",
        filters: { property_type: "apartment" },
        contact: { name: "Noa Levi", whatsapp: "+359880000001" },
        contact_preference: "whatsapp",
        alertConsent: true,
      },
    }),
    hermesChatDisabled: await dispatchHttp(app, {
      method: "POST",
      url: "/api/hermes/chat",
      body: {
        locale: "he",
        query: "Sandanski",
      },
    }),
    sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
    robots: await dispatchHttp(app, { url: "/robots.txt" }),
    favicon: await dispatchHttp(app, { url: "/favicon.ico" }),
    sellerPage: await dispatchHttp(app, { url: "/he/sell" }),
    sellerHtml: await dispatchHttp(app, { url: "/he/sell?format=html" }),
    contact: await dispatchHttp(app, { url: "/he/contact" }),
    contactHtml: await dispatchHttp(app, { url: "/he/contact?format=html" }),
    guidePage: await dispatchHttp(app, { url: "/en/guides/foreign-buyers" }),
    guideHtml: await dispatchHttp(app, { url: "/en/guides/foreign-buyers?format=html" }),
    lead: leadResponse,
    replyDraft: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies/draft",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId,
        language: "he",
        listingFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
      },
    }),
    replyDraftUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies/draft",
      body: { leadId, language: "he" },
    }),
    viewingLead: viewingLeadResponse,
    contactLead: contactLeadResponse,
    sellerLead: sellerLeadResponse,
    admin: await dispatchHttp(app, {
      url: "/api/admin/leads?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminMigrationReview: await dispatchHttp(app, {
      url: "/api/admin/migration/review?locale=bg",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminMigrationReviewUnauthorized: await dispatchHttp(app, { url: "/api/admin/migration/review?locale=bg" }),
    adminUnauthorized: await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" }),
    reply: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId,
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      },
    }),
    replyUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      body: { leadId, reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
    }),
    leadQualification: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/lead-pipeline/outcome",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId,
        actor: "broker_ru",
        action: "qualify",
        budgetMinEur: 90000,
        budgetMaxEur: 160000,
        locations: ["Sandanski"],
        propertyTypes: ["apartment"],
        bedroomsMin: 2,
        timeline: "Within six months",
        financeStatus: "cash",
      },
    }),
    viewing: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        id: "viewing-http-contact-lead-test",
        leadId: contactLeadId,
        startsAt: "2026-07-06T10:00:00Z",
        broker: "broker_ru",
      },
    }),
    viewingFollowUp: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings/follow-up",
      headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        viewingId: "viewing-http-contact-lead-test",
        actor: "broker_ru",
        action: "complete",
        note: "Viewing completed; feedback remains a private broker task.",
      }).toString(),
    }),
    viewingFollowUpRetry: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings/follow-up",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        viewingId: "viewing-http-contact-lead-test",
        actor: "broker_ru",
        action: "complete",
        note: "Viewing completed; feedback remains a private broker task.",
      },
    }),
    viewingFollowUpUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings/follow-up",
      body: { viewingId: "viewing-http-contact-lead-test", actor: "broker_ru", action: "complete" },
    }),
    viewingUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings",
      body: { leadId: contactLeadId, startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" },
    }),
    viewingCalendar: await dispatchHttp(app, {
      url: "/api/admin/viewings.ics",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    viewingCalendarUnauthorized: await dispatchHttp(app, { url: "/api/admin/viewings.ics" }),
    dealClose: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/deals/close",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: { leadId: contactLeadId, broker: "broker_ru" },
    }),
    dealCloseUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/deals/close",
      body: { leadId: contactLeadId, broker: "broker_ru" },
    }),
  };
  smoke.formReply = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      leadId: contactLeadId,
      language: "he",
      reviewedReply: "Reviewed callback reply approved by broker.",
      reviewer: "broker_en",
      approved: "true",
    }).toString(),
  });
  smoke.translationDraft = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/draft",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      objectType: "listing",
      objectId: "MS-CRAWL-0001",
      sourceLocale: "bg",
      targetLocale: "el",
      sourceContent: {
        title: "Reviewed listing title",
        description: "Reviewed listing description for Sandanski.",
      },
      propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
      draftOutput: hermesDraftOutput({ id: "MS-CRAWL-0001", location: "Sandanski" }, "el"),
    },
  });
  smoke.translationApprove = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/approve",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: smoke.translationDraft.body.id,
      reviewer: "translator_el",
      approvedAt: "2026-07-04T00:02:00Z",
    },
  });
  smoke.translationPublish = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/publish",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: smoke.translationApprove.body.id,
    },
  });
  smoke.listingEditorHtml = await dispatchHttp(app, {
    url: "/admin/listings/edit?locale=bg&listingId=MS-CRAWL-0001",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const previousAdminActor = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = "editor_bg";
  smoke.listingEdit = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/edit",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      listingId: "MS-CRAWL-0001",
      description: "Updated approved source description.",
    }).toString(),
  });
  if (previousAdminActor === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
  else process.env.MS_REALTY_ADMIN_ACTOR = previousAdminActor;
  smoke.staleListing = await dispatchHttp(app, { url: "/el/akinita/MS-CRAWL-0001" });
  smoke.staleSearch = await dispatchHttp(app, { url: "/api/search?locale=el&q=Sandanski" });
  smoke.adminLocales = {
    bg: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=bg",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    ru: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    en: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=en",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    heFallback: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=he",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
  };
  smoke.localeCreate = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "es",
      native_name: "Español",
      admin_name: "Spanish",
      route_segments: { listing: "propiedades", search: "buscar" },
    },
  });
  smoke.localeFallback = await dispatchHttp(app, { url: "/es/" });
  smoke.ctaClick = await dispatchHttp(app, {
    method: "POST",
    url: "/api/events",
    body: {
      type: "cta_click",
      path: "/he/properties/MS-CRAWL-0001",
      locale: "he",
      listingReference: "MS-CRAWL-0001",
      action: "sticky_inquiry",
    },
  });
  smoke.admin = await dispatchHttp(app, {
    url: "/api/admin/leads?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.adminHtml = await dispatchHttp(app, {
    url: "/admin/leads?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.adminMigrationReview = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=bg",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.adminMigrationReviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=bg",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const reviewedAssetId = mediaAssetId({ asset_url: smoke.listing.body.body.media.gallery[0].url });
  smoke.mediaReview = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/media/reviews",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      listingId: "MS-CRAWL-0001",
      assetId: reviewedAssetId,
      decision: "publish",
      kind: "floor_plan",
      alt: "Human-reviewed floor plan for MS-CRAWL-0001.",
      replacementUrl: "https://cdn.example.test/listings/MS-CRAWL-0001-floor-plan.webp",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
  });
  smoke.listingAfterMediaReview = await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" });
  smoke.listingHtmlAfterMediaReview = await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?format=html" });
  smoke.leadAssignment = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/leads/assign",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      leadId,
      brokerId: "broker_ru",
      actor: "sales_manager",
      reason: "Owner approved reassignment for Russian follow-up.",
      assignmentConfirmed: true,
    },
  });
  smoke.adminAfterLeadAssignment = await dispatchHttp(app, {
    url: "/api/admin/leads?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.contacts = await dispatchHttp(app, {
    url: "/api/admin/contacts?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.contactsHtml = await dispatchHttp(app, {
    url: "/admin/contacts?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.accountCreated = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/accounts",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: { accountType: "family", label: "HTTP review household", actor: "sales_manager", humanConfirmed: true },
  });
  smoke.accountLinked = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/accounts/link",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      accountId: smoke.accountCreated.body.account_id,
      contactId: smoke.contacts.body.contacts[0].id,
      actor: "sales_manager",
      reason: "Broker confirmed the same household.",
      linkConfirmed: true,
    },
  });
  smoke.contactsAfterLink = await dispatchHttp(app, {
    url: "/api/admin/contacts?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.documents = await dispatchHttp(app, {
    url: "/api/admin/documents?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.documentsHtml = await dispatchHttp(app, {
    url: "/admin/documents?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.documentOutcome = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents/outcome",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      leadId,
      itemKey: "foreign_process_scope",
      status: "complete",
      actor: "sales_manager",
      note: "Broker confirmed that foreign-buyer guidance applies.",
      humanConfirmed: true,
    },
  });
  smoke.documentsAfter = await dispatchHttp(app, {
    url: "/api/admin/documents?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(assertHttpSmoke(smoke), true);
  assert.equal(smoke.health.body.status, "ok");
  assert.equal(smoke.health.body.build_marker, "unversioned");
  assert.deepEqual(smoke.health.body.blockers, [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "r2_media_coverage",
    "production_recovery",
  ]);
  assert.equal(smoke.ready.status, 503);
  assert.equal(smoke.ready.body.status, "blocked");
  assert.deepEqual(
    smoke.ready.body.blocked_gates.map((gate) => gate.id),
    [
      "live_services",
      "monitoring_rollback",
      "payload_runtime",
      "r2_media_coverage",
      "production_recovery",
    ],
  );
  assert.equal(smoke.ready.headers["cache-control"], "no-store");
  assert.equal(smoke.ready.headers["retry-after"], "60");
  assert.equal(smoke.health.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(smoke.homeHtml.headers["x-frame-options"], "DENY");
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(smoke.favicon.headers["content-type"], "image/svg+xml; charset=utf-8");
  assert.match(smoke.favicon.body, /#DB3E3E/);
  assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
  assert.equal(smoke.home.body.body.search.path, "/he/search");
  assert.equal(smoke.homeHtml.body.includes("data-kind=\"home\""), true);
  assert.equal(smoke.homeHtml.body.includes("data-react-public-ui=\"home\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-kind=\"listing-print\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-react-public-ui="), false);
  assert.equal(smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\""), true);
  assert.equal(smoke.search.body.cards.length > 0, true);
  assert.equal(smoke.searchPriceAsc.body.search.sort, "price_asc");
  assert.deepEqual(
    smoke.searchPriceAsc.body.cards.map((card) => Number(card.price_eur)).filter(Number.isFinite),
    [...smoke.searchPriceAsc.body.cards.map((card) => Number(card.price_eur)).filter(Number.isFinite)].sort((left, right) => left - right),
  );
  assert.match(smoke.searchHtmlPriceDesc.body, /<option value="price_desc" selected>/);
  assert.equal(smoke.location.body.cards.length, 1);
  assert.equal(smoke.locationHtml.body.includes("data-location=\"Sandanski\""), true);
  assert.deepEqual(smoke.savedSearch.body.filters, { property_type: "apartment" });
  assert.equal(smoke.savedSearch.body.contact, undefined);
  assert.equal(smoke.savedSearch.body.contactVault.encrypted, true);
  assert.equal(smoke.savedSearch.headers["cache-control"], "no-store");
  assert.equal(smoke.hermesChatDisabled.status, 404);
  assert.equal(smoke.hermesChatDisabled.body.kind, "not_found");
  assert.equal(smoke.hermesChatDisabled.headers["cache-control"], "no-store");
  assert.equal(smoke.lead.body.contact_preference, "whatsapp");
  assert.equal(smoke.lead.body.contactVault.encrypted, true);
  assert.equal(smoke.lead.body.broker_assignment.broker_id, "broker_international");
  assert.equal(smoke.lead.body.broker_assignment.criteria.location, "Sandanski");
  assert.equal(smoke.lead.headers["cache-control"], "no-store");
  assert.equal(smoke.replyDraft.status, 201);
  assert.equal(smoke.replyDraft.body.status, "hermes_reply_draft");
  assert.equal(smoke.replyDraft.body.can_send_without_approval, false);
  assert.equal(smoke.replyDraft.body.broker_approval_required, true);
  assert.equal(smoke.replyDraftUnauthorized.status, 401);
  assert.equal(hermesReplyPrompts[0].capabilities.can_send_customer_messages, false);
  assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
  assert.equal(smoke.viewingLead.body.broker_assignment.broker_id, "broker_international");
  assert.equal(smoke.viewing.body.feedback_request.status, "open");
  assert.equal(smoke.viewing.body.feedback_request.channel, "phone");
  assert.equal(smoke.viewingFollowUp.status, 201);
  assert.equal(smoke.viewingFollowUp.body.idempotent, false);
  assert.equal(smoke.viewingFollowUp.body.viewing.status, "completed");
  assert.equal(smoke.viewingFollowUp.body.viewing.feedback_request.status, "open");
  assert.equal(smoke.viewingFollowUpRetry.status, 200);
  assert.equal(smoke.viewingFollowUpRetry.body.idempotent, true);
  assert.equal(smoke.viewingFollowUpUnauthorized.status, 401);
  assert.equal(smoke.dealClose.body.testimonial_request.status, "open");
  assert.equal(smoke.dealClose.body.referral_request.status, "open");
  assert.equal(smoke.dealClose.body.testimonial_request.channel, "phone");
  assert.equal(smoke.contact.body.body.callback.payload.source, "website_contact_callback");
  assert.equal(smoke.contactHtml.body.includes("data-lead-type=\"general\""), true);
  assert.equal(smoke.contactLead.body.lead.leadType, "general");
  assert.equal(smoke.admin.body.leads.find((lead) => lead.lead_id === leadId).contact.whatsapp, "+359880000001");
  assert.match(smoke.adminHtml.body, /data-private-contact="true"/);
  assert.match(smoke.adminHtml.body, /https:\/\/wa\.me\/359880000001/);
  assert.equal(smoke.guidePage.body.kind, "guide");
  assert.equal(smoke.guidePage.body.indexable, true);
  assert.match(smoke.guidePage.body.body.sections[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
  assert.match(smoke.guideHtml.body, /data-kind="guide"/);
  assert.match(smoke.guideHtml.body, /data-react-public-ui="guide"/);
  assert.equal(smoke.languageRequest.headers["cache-control"], "no-store");
  assert.equal(smoke.languageRequest.body.contact, undefined);
  assert.equal(smoke.languageRequest.body.contactVault.encrypted, true);
  assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(smoke.tourApproval.body.is_public, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.available, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.mount_target, "psv-listing-tour");
  assert.match(smoke.listingHtmlAfterTourApproval.body, /data-photo-sphere-viewer="psv-listing-tour"/);
  assert.match(smoke.listingHtmlAfterTourApproval.body, /data-panorama-url="https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/tours\/MS-CRAWL-0001\.jpg"/);
  assert.equal(smoke.mediaReview.status, 201);
  assert.equal(smoke.mediaReview.body.review_status, "approved_by_human");
  assert.equal(smoke.listingAfterMediaReview.body.body.media.floor_plans.length, 1);
  assert.equal(smoke.listingAfterMediaReview.body.body.media.floor_plans[0].reviewer, undefined);
  assert.match(smoke.listingHtmlAfterMediaReview.body, /data-floor-plan-gallery="true"/);
  assert.match(smoke.listingHtmlAfterMediaReview.body, /MS-CRAWL-0001-floor-plan\.webp/);
  assert.equal(smoke.leadAssignment.status, 201);
  assert.equal(smoke.leadAssignment.body.previous_broker_id, "broker_international");
  assert.equal(smoke.adminAfterLeadAssignment.body.leads.find((lead) => lead.lead_id === leadId).assigned_broker, "broker_ru");
  assert.equal(smoke.slugChange.body.new_path, "/he/properties/MS-CRAWL-0001");
  assert.equal(smoke.slugRedirect.headers.location, "/he/properties/MS-CRAWL-0001");
  assert.equal(smoke.slugChangeUnauthorized.status, 401);
  assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
  assert.equal(readLeadContacts(leadContactVaultPath, leadContactKey).size, 4);
  assert.equal(readPublicContacts(publicContactVaultPath, publicContactKey).size, 2);
  assert.doesNotMatch(fs.readFileSync(leadContactVaultPath, "utf8"), /Noa Levi|Nikos Papadopoulos|359880000001/);
  assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
  assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
  assert.equal(assertTranslationLedger(readTranslationLedger(translationLedgerPath)), true);
  assert.deepEqual(readListingEdits(listingEditLedgerPath), []);
  assert.equal(assertViewingLedger(readViewings(viewingLedgerPath)), true);
  assert.equal(assertViewingFollowUpLedger(readViewingFollowUps(viewingFollowUpLedgerPath)), true);
  assert.equal(assertLeadPipelineOutcomes(readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath)), true);
  assert.equal(assertSavedSearches(readSavedSearches(savedSearchLedgerPath)), true);
  assert.equal(assertSellerPipeline(readSellerPipeline(sellerPipelinePath)), true);
  assert.equal(assertDealLedger(readDeals(dealLedgerPath)), true);
  assert.equal(assertBrokerContacts(readBrokerContacts(brokerContactLedgerPath)), true);
  assert.equal(assertTourApprovals(readTourApprovals(tourApprovalLedgerPath)), true);
  assert.equal(assertMediaReviews(readMediaReviews(mediaReviewLedgerPath)), true);
  assert.equal(assertLeadAssignments(readLeadAssignments(leadAssignmentLedgerPath)), true);
  assert.equal(assertEventLedger(readEventLedger(eventLedgerPath)), true);
  assert.equal(assertConsentLedger(readConsentLedger(consentLedgerPath)), true);
  assert.equal(assertSlugHistory(readSlugHistory(slugHistoryPath)), true);
  assert.deepEqual(
    readConsentLedger(consentLedgerPath).reduce((counts, row) => {
      counts[row.consent_type] = (counts[row.consent_type] || 0) + 1;
      return counts;
    }, {}),
    { language_request: 1, saved_search_alerts: 1, inquiry_follow_up: 4 },
  );
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.deepEqual(actionCounts(auditRows), {
    account_created: 1,
    broker_contact_approved: 1,
    contact_linked: 1,
    hermes_model_call: 1,
    tour_approved: 1,
    media_reviewed: 1,
    lead_assigned: 1,
    lead_pipeline_outcome_recorded: 1,
    listing_slug_changed: 1,
    reply_approved: 2,
    viewing_booked: 1,
    viewing_follow_up_recorded: 1,
    deal_closed: 1,
    document_checklist_updated: 1,
    translation_drafted: 1,
    translation_approved: 1,
    translation_published: 1,
    locale_created: 1,
  });
  assert.equal(readEventLedger(eventLedgerPath).some((row) => row.type === "cta_click" && row.action === "sticky_inquiry"), true);
  assert.equal(readEventLedger(eventLedgerPath).some((row) => row.type === "hermes_chat"), false);
  assert.equal(smoke.staleListing.body.metadata.robots, "index,follow");
  assert.notEqual(smoke.staleListing.body.body.description, "Updated approved source description.");
  assert.equal(smoke.admin.body.leads.length, 4);
  assert.equal(smoke.contacts.status, 200);
  assert.equal(smoke.contacts.body.kind, "admin_contacts");
  assert.equal(smoke.contacts.body.contacts.length, 2);
  assert.equal(smoke.contacts.body.summary.duplicate_leads, 2);
  assert.equal(smoke.contactsHtml.body.includes('data-kind="admin-contacts"'), true);
  assert.equal(smoke.contactsHtml.body.includes('data-account-create-form="true"'), true);
  assert.equal(smoke.accountCreated.status, 201);
  assert.equal(smoke.accountLinked.status, 201);
  assert.equal(smoke.contactsAfterLink.body.contacts[0].account_id, smoke.accountCreated.body.account_id);
  assert.equal(smoke.documents.status, 200);
  assert.equal(smoke.documents.body.documentChecklistQueue.rows.length, 4);
  assert.equal(smoke.documentsHtml.body.includes('data-kind="admin-document-checklists"'), true);
  assert.equal(smoke.documentsHtml.body.includes('data-process-guardrail="true"'), true);
  assert.equal(smoke.documentOutcome.status, 201);
  assert.equal(smoke.documentsAfter.body.documentChecklistQueue.rows.find((row) => row.lead_id === leadId).completed_count, 1);
  assert.equal(smoke.admin.body.leadSla.summary.total_leads, 4);
  assert.equal(smoke.admin.body.leadSla.summary.manager_escalation_required, 4);
  assert.equal(smoke.admin.body.leadSla.summary.customer_reply_sent, 0);
  assert.equal(smoke.admin.body.summary.leadSlaManagerEscalations, 4);
  assert.equal(smoke.admin.body.summary.repliesQueued, 2);
  assert.equal(smoke.admin.body.summary.repliesSent, 0);
  assert.equal(smoke.admin.body.communicationThreads.length, 4);
  assert.equal(smoke.admin.body.communicationThreads[0].events[0].type, "inbound_request");
  assert.equal(smoke.admin.body.communicationTemplates[smoke.admin.body.leads[0].lead_id][0].human_review_required, true);
  assert.equal(smoke.admin.headers["cache-control"], "no-store");
  assert.equal(smoke.admin.body.languageRequests.length, 1);
  assert.equal(smoke.adminHtml.body.includes("data-kind=\"admin-lead-inbox\""), true);
  assert.equal(smoke.adminHtml.body.includes("data-react-admin-ui=\"lead-inbox\""), true);
  assert.equal(smoke.adminHtml.body.includes("Эскалации менеджеру"), true);
  assert.equal(smoke.adminHtml.body.includes('data-sla-status="manager_escalation_required"'), true);
  assert.equal(smoke.adminHtml.body.includes("Срок эскалации"), true);
  assert.equal(smoke.adminHtml.body.includes('action="/api/admin/replies/draft"'), true);
  assert.equal(smoke.adminHtml.body.includes('data-hermes-draft-request="true"'), true);
  assert.equal(smoke.adminHtml.body.includes('data-reply-delivery-form="true"'), true);
  assert.equal(smoke.adminHtml.body.includes('name="hermesDraftText"'), true);
  assert.equal(smoke.adminHtml.body.includes('data-communication-thread='), true);
  assert.equal(smoke.adminHtml.body.includes('data-communication-template-select="true"'), true);
  assert.equal(smoke.adminHtml.body.includes('data-lead-brief='), true);
  assert.equal(smoke.adminHtml.body.includes('data-decision-source="deterministic_workflow"'), true);
  assert.equal(smoke.adminHtml.body.includes('data-next-best-action="manager_review_and_reply"'), true);
  assert.equal(smoke.adminHtml.body.includes('name="hermesDraft" value="true"'), false);
  assert.equal(smoke.adminHtml.headers["cache-control"], "no-store");
  assert.equal(smoke.adminHtml.body.includes("data-interface-locales=\"bg,ru,en\""), true);
  assert.equal(smoke.listingEditorHtml.status, 200);
  assert.match(smoke.listingEditorHtml.body, /data-admin-mutation-form="listing"/);
  assert.equal(smoke.listingEdit.status, 503);
  assert.equal(smoke.listingEdit.body.kind, "payload_draft_unavailable");
  assert.equal(smoke.admin.body.savedSearches.length, 1);
  assert.equal(smoke.admin.body.sellerPipeline.length, 1);
  assert.equal(smoke.admin.body.deals.length, 1);
  assert.equal(smoke.admin.body.translationTasks.some((task) => task.status === "stale"), false);
  assert.equal(smoke.admin.body.listingEdits.length, 0);
  assert.equal(smoke.admin.body.viewings.length, 1);
  assert.equal(smoke.admin.body.summary.viewingFollowUpsOpen, 1);
  assert.equal(smoke.admin.body.viewingFollowUpQueue.rows[0].task, "feedback");
  assert.equal(smoke.adminHtml.body.includes('data-viewing-follow-up-queue="true"'), true);
  assert.equal(smoke.adminHtml.body.includes('action="/api/admin/viewings/follow-up"'), true);
  assert.equal(smoke.adminMigrationReview.body.workspace.locale, "bg");
  assert.equal(smoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows, 11859);
  assert.equal(smoke.adminMigrationReview.body.routeMap.total, 457);
  assert.equal(smoke.adminMigrationReview.body.routeMap.sourceReviewRequired, 457);
  assert.equal(smoke.adminMigrationReview.body.routeMap.reviewRequired, 292);
  assert.equal(smoke.adminMigrationReview.body.routeMap.mappedListings, 165);
  assert.deepEqual(smoke.adminMigrationReview.body.routeMap.pendingPagination, {
    page: 1,
    pageSize: 10,
    totalPages: 30,
    totalRows: 292,
  });
  assert.equal(smoke.adminMigrationReview.body.routeMap.pendingSample[0].source_evidence.title, "Недвижими имоти в Сандански | MS Realty");
  assert.equal(smoke.adminMigrationReview.headers["cache-control"], "no-store");
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-kind=\"admin-migration-review\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-react-admin-ui=\"migration-review\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-source-evidence=\"true\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-pending-route-decision=\"true\""), true);
  assert.equal(smoke.adminMigrationReviewUnauthorized.status, 401);
  assert.equal(smoke.adminMigrationReviewUnauthorized.headers["cache-control"], "no-store");
  assert.equal(smoke.adminMigrationReviewUnauthorized.headers["www-authenticate"], 'Bearer realm="ms-realty-admin"');
  assert.deepEqual(
    Object.values(smoke.adminLocales).map((response) => response.body.workspace.interface_locales),
    [
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
    ],
  );
  assert.deepEqual(
    [
      smoke.adminLocales.bg.body.workspace.locale,
      smoke.adminLocales.ru.body.workspace.locale,
      smoke.adminLocales.en.body.workspace.locale,
      smoke.adminLocales.heFallback.body.workspace.locale,
    ],
    ["bg", "ru", "en", "en"],
  );
  assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "he").direction, "rtl");
  assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "el").public_enabled, true);
  assert.equal(smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR"), true);
  assert.equal(smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.lead_type === "seller" && lead.original_language === "el"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_viewing_request"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_contact_callback"), true);
  assert.deepEqual(smoke.admin.body.workspace.interface_locales, ["bg", "ru", "en"]);
});

test("HTTP admin can append reviewed redirect approvals without broad homepage mappings", async () => {
  const redirectApprovalPath = tempRedirectApprovals();
  const deployableRedirectOutputPath = tempDeployableRedirects();
  const listingEditLedgerPath = tempListingEdits();
  const listingQualityReviewPath = tempListingQualityReviewPath();
  const translationLedgerPath = tempTranslations();
  const auditLogPath = tempAuditLog();
  const liveServiceProvisioningReportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-provisioning-`)}/mounted-live-service-provisioning-report.json`;
  const payloadRuntimeReportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-payload-runtime-`)}/mounted-payload-runtime-report.json`;
  fs.copyFileSync(fromRoot("production", "data", "live-service-provisioning-report.json"), liveServiceProvisioningReportPath);
  fs.writeFileSync(
    payloadRuntimeReportPath,
    `${JSON.stringify(await buildPayloadRuntimeReport({ env: {}, generatedAt: "2026-07-05T00:00:00Z" }), null, 2)}\n`,
  );
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path);
  const importListing = routeMap.find(
    (route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path && route.old_url !== listing.old_url,
  );
  const ruListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path);
  const importRuListing = routeMap.find(
    (route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path && route.old_url !== ruListing.old_url,
  );
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const app = createHttpApp({
    routeMap,
    redirectApprovalPath,
    deployableRedirectOutputPath,
    listingEditLedgerPath,
    listingQualityReviewPath,
    translationLedgerPath,
    auditLogPath,
    liveServiceProvisioningReportPath,
    payloadRuntimeReportPath,
    reviewedAt: "2026-07-05T00:00:00Z",
    editedAt: "2026-07-05T00:03:00Z",
    listingQualityGeneratedAt: "2026-07-05T00:09:00Z",
  });

  const approved = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      oldUrl: listing.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
      reason: "Reviewed listing parity in migration workbench.",
    },
  });
  const formApproved = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      oldUrl: ruListing.old_url,
      equivalentContent: "true",
      reviewer: "ru_preservation_editor",
      reason: "Reviewed same-content Russian route mapping.",
    }).toString(),
  });
  const rejected = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      oldUrl: taxonomy.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
    },
  });
  const unauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    body: {
      oldUrl: listing.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
    },
  });
  const importUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: { "content-type": "text/csv" },
    body: `old_url,equivalent_content,reviewer,reason\n${importListing.old_url},true,editor_bg,Reviewed via CSV\n`,
  });
  const workbookUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook",
  });
  const workbook = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const qualityWorkbookUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-workbook",
  });
  const qualityWorkbook = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-workbook",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const qualityReviewDraftUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-draft",
  });
  const qualityReviewDraft = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-draft",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const inlineQualityReview = parseCsv(completeListingQualityReviewCsv(qualityReviewDraft.body, 1))[0];
  const qualityImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: { "content-type": "text/csv" },
    body: completeListingQualityReviewCsv(qualityReviewDraft.body, 1),
  });
  const qualityImported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/json",
    },
    body: inlineQualityReview,
  });
  const launchChecklistUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/launch-input-checklist",
  });
  const launchChecklist = await dispatchHttp(app, {
    url: "/api/admin/launch-input-checklist",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const preflightReportsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/preflight-reports",
  });
  const preflightReports = await dispatchHttp(app, {
    url: "/api/admin/preflight-reports",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const seoPreflightUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-preflight",
  });
  const seoPreflight = await dispatchHttp(app, {
    url: "/api/admin/seo-preflight",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveServicesUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-services",
  });
  const liveServices = await dispatchHttp(app, {
    url: "/api/admin/live-services",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveServiceProvisioningUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-service-provisioning",
  });
  const liveServiceProvisioning = await dispatchHttp(app, {
    url: "/api/admin/live-service-provisioning",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadRuntimeUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime",
  });
  const payloadRuntime = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadRuntimeBootstrapUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime-bootstrap",
  });
  const payloadRuntimeBootstrap = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime-bootstrap",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const listingQualityUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality",
  });
  const listingQualityStatus = await dispatchHttp(app, {
    url: "/api/admin/listing-quality",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const listingQualityReviewPacketUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-packet",
  });
  const listingQualityReviewPacket = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-packet",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const cmsCollectionsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/cms-collections",
  });
  const cmsCollections = await dispatchHttp(app, {
    url: "/api/admin/cms-collections",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadCollectionsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-collections",
  });
  const payloadCollections = await dispatchHttp(app, {
    url: "/api/admin/payload-collections",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: `old_url,equivalent_content,reviewer,approved_at,reason\n${importListing.old_url},true,editor_bg,2026-07-05T00:01:00Z,Reviewed via CSV\n`,
  });
  const formImported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csv: `old_url,equivalent_content,reviewer,approved_at,reason\n${importRuListing.old_url},true,ru_preservation_editor,2026-07-05T00:02:00Z,Reviewed via pasted CSV\n`,
    }).toString(),
  });
  const pendingWorkbook = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook?pending=1",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const exportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/deployable-redirects/export",
  });
  const exported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/deployable-redirects/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const review = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const reviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(approved.status, 201);
  assert.equal(approved.body.approval.old_url, listing.old_url);
  assert.equal(approved.body.approval.deployable, true);
  assert.equal(approved.body.deployablePreview.length, 1);
  assert.equal(approved.body.deployablePreview[0].target_path, listing.target_path);
  assert.equal(approved.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(formApproved.status, 201);
  assert.equal(formApproved.body.deployablePreview.length, 2);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /Route decision must be redirect_301, retain_200, or approved_410/);
  assert.equal(unauthorized.status, 401);
  assert.equal(importUnauthorized.status, 401);
  assert.equal(workbookUnauthorized.status, 401);
  assert.equal(workbook.status, 200);
  assert.equal(workbook.headers["cache-control"], "no-store");
  assert.equal(workbook.headers["content-type"], "text/csv; charset=utf-8");
  const redirectWorkbookRows = parseCsv(workbook.body);
  assert.equal(redirectWorkbookRows.length, 457);
  assert.equal(redirectWorkbookRows[0].source_status, "200");
  assert.ok(redirectWorkbookRows[0].source_title);
  assert.ok(redirectWorkbookRows[0].review_owner);
  assert.equal(qualityWorkbookUnauthorized.status, 401);
  assert.equal(qualityWorkbook.status, 200);
  assert.equal(qualityWorkbook.headers["content-type"], "text/csv; charset=utf-8");
  assert.ok(parseCsv(qualityWorkbook.body).length >= review.body.listingQuality.summary.affected_listings);
  assert.equal(qualityReviewDraftUnauthorized.status, 401);
  assert.equal(qualityReviewDraft.status, 200);
  assert.equal(qualityReviewDraft.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(qualityReviewDraft.headers["content-disposition"], 'attachment; filename="listing-quality-review-draft.csv"');
  assert.ok(parseCsv(qualityReviewDraft.body).every((row) => row.facts_reviewer === "" && row.media_reviewer === ""));
  assert.equal(qualityImportUnauthorized.status, 401);
  assert.equal(qualityImported.status, 202);
  assert.equal(qualityImported.body.imported, 1);
  assert.equal(qualityImported.body.edited, 1);
  assert.equal(qualityImported.body.factsReviewRows, 1);
  assert.equal(qualityImported.body.reviewSummary.review_rows, qualityImported.body.imported);
  assert.equal(qualityImported.body.reviewSummary.missing_review_rows, qualityImported.body.missingReviewRows);
  assert.equal(
    qualityImported.body.reviewSummary.expected_review_rows,
    qualityImported.body.imported + qualityImported.body.missingReviewRows,
  );
  assert.equal(qualityImported.body.reviewImport.ready, false);
  assert.equal(qualityImported.body.reviewImport.status, "blocked");
  assert.equal(qualityImported.body.reviewImport.reviewRows, qualityImported.body.imported);
  assert.equal(qualityImported.body.reviewImport.missingReviewRows, qualityImported.body.missingReviewRows);
  assert.ok(qualityImported.body.reviewImport.pendingReviewSample.length > 0);
  assert.equal(qualityImported.body.report.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(qualityImported.body.report.blockers.includes("listing_quality_review"), false);
  assert.equal(qualityImported.body.reviewPersisted, true);
  assert.equal(qualityImported.body.reviewPath, listingQualityReviewPath);
  assert.equal(parseCsv(fs.readFileSync(listingQualityReviewPath, "utf8")).length, 1);
  assert.equal(readListingEdits(listingEditLedgerPath).length, 1);
  assert.deepEqual(readListingEdits(listingEditLedgerPath)[0].patch, { area_sqm: 85 });
  assert.equal(readListingEdits(listingEditLedgerPath)[0].editor, "editor_bg");
  assert.equal(readListingEdits(listingEditLedgerPath)[0].review_source, "listing_quality_workbench");
  assert.equal(launchChecklistUnauthorized.status, 401);
  assert.equal(launchChecklist.status, 200);
  assert.equal(launchChecklist.headers["content-type"], "text/markdown; charset=utf-8");
  assert.match(launchChecklist.body, /POST \/api\/admin\/redirect-approvals\/import/);
  assert.doesNotMatch(launchChecklist.body, /POST \/api\/admin\/seo-evidence\/import/);
  assert.match(launchChecklist.body, /POST \/api\/admin\/listing-quality\/import/);
  assert.ok(launchChecklist.body.includes(liveServiceProvisioningReportPath));
  assert.equal(preflightReportsUnauthorized.status, 401);
  assert.equal(preflightReports.status, 200);
  assert.equal(preflightReports.body.kind, "admin_preflight_reports");
  assert.equal(preflightReports.body.checklist.endpoint, "/api/admin/launch-input-checklist");
  assert.equal(preflightReports.body.checklist.path, "production/data/launch-input-checklist.md");
  assert.equal(preflightReports.body.checklist.refresh_command, "npm run launch:inputs");
  assert.deepEqual(preflightReports.body.launch_readiness.blockers, review.body.launchBlockers.blockers);
  assert.ok(preflightReports.body.launch_readiness.blocked_gates.every((gate) => gate.next_actions.length > 0));
  assert.equal(preflightReports.body.reports.seo.status, "blocked");
  assert.ok(preflightReports.body.reports.seo.next_actions.some((action) => action.includes("seo:preflight")));
  assert.equal(preflightReports.body.reports.listing_quality.status, "blocked");
  assert.ok(preflightReports.body.reports.listing_quality.next_actions.some((action) => action.includes("listing:preflight")));
  assert.equal(preflightReports.body.reports.live_services.status, "blocked");
  assert.equal(preflightReports.body.reports.live_service_provisioning.status, "blocked_report");
  assert.ok(preflightReports.body.reports.live_service_provisioning.summary.missing_env.includes("DATABASE_URL"));
  assert.ok(preflightReports.body.reports.live_service_provisioning.next_actions.some((action) => action.includes("live:provisioning")));
  assert.equal(preflightReports.body.reports.payload_runtime.status, "blocked_report");
  assert.ok(preflightReports.body.reports.payload_runtime.next_actions.some((action) => action.includes("payload:runtime")));
  assert.equal(seoPreflightUnauthorized.status, 401);
  assert.equal(seoPreflight.status, 200);
  assert.equal(seoPreflight.body.kind, "admin_seo_preflight");
  assert.equal(seoPreflight.body.seo.status, "blocked");
  assert.ok(seoPreflight.body.seo.summary.missing_required_sources.includes("search_console"));
  assert.equal(seoPreflight.body.seo.summary.sources.privacy_events.status, "missing_export");
  assert.equal(liveServicesUnauthorized.status, 401);
  assert.equal(liveServices.status, 200);
  assert.equal(liveServices.body.kind, "admin_live_services");
  assert.equal(liveServices.body.live_services.status, "blocked");
  assert.ok(liveServices.body.live_services.summary.missing_report > 0);
  assert.equal(liveServiceProvisioningUnauthorized.status, 401);
  assert.equal(liveServiceProvisioning.status, 200);
  assert.equal(liveServiceProvisioning.body.kind, "admin_live_service_provisioning");
  assert.equal(liveServiceProvisioning.body.provisioning.status, "blocked_report");
  assert.ok(liveServiceProvisioning.body.provisioning.summary.missing_env.includes("DATABASE_URL"));
  assert.ok(liveServiceProvisioning.body.provisioning.next_actions.some((action) => action.includes("live:provisioning")));
  assert.equal(liveServiceProvisioning.body.provisioning.hermes.install_command, "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash");
  assert.equal(liveServiceProvisioning.body.provisioning.hermes.safety.can_publish, false);
  assert.equal(payloadRuntimeUnauthorized.status, 401);
  assert.equal(payloadRuntime.status, 200);
  assert.equal(payloadRuntime.body.kind, "admin_payload_runtime");
  assert.equal(payloadRuntime.body.runtime.status, "blocked_report");
  assert.ok(payloadRuntime.body.runtime.next_actions.some((action) => action.includes("payload:runtime")));
  assert.equal(payloadRuntimeBootstrapUnauthorized.status, 401);
  assert.equal(payloadRuntimeBootstrap.status, 200);
  assert.equal(payloadRuntimeBootstrap.body.kind, "admin_payload_runtime_bootstrap");
  assert.match(payloadRuntimeBootstrap.body.env_example, /PAYLOAD_SECRET=replace-with-output-of-openssl-rand-base64-32/);
  assert.match(payloadRuntimeBootstrap.body.compose_file, /payload-postgres/);
  assert.ok(payloadRuntimeBootstrap.body.checklist.some((item) => item.includes("npm run payload:runtime")));
  assert.equal(listingQualityUnauthorized.status, 401);
  assert.equal(listingQualityStatus.status, 200);
  assert.equal(listingQualityStatus.body.kind, "admin_listing_quality");
  assert.equal(listingQualityStatus.body.listing_quality.status, "blocked");
  assert.ok(listingQualityStatus.body.listing_quality.next_actions.some((action) => action.includes("listing:preflight")));
  assert.ok(listingQualityStatus.body.listing_quality.summary.affected_listings > 0);
  assert.equal(listingQualityReviewPacketUnauthorized.status, 401);
  assert.equal(listingQualityReviewPacket.status, 200);
  assert.equal(listingQualityReviewPacket.body.kind, "listing_quality_review_packet");
  assert.equal(listingQualityReviewPacket.body.status, "draft_not_launch_evidence");
  assert.equal(listingQualityReviewPacket.body.admin.review_packet_endpoint, "GET /api/admin/listing-quality-review-packet");
  assert.ok(listingQualityReviewPacket.body.summary.expected_review_rows > 0);
  assert.equal(cmsCollectionsUnauthorized.status, 401);
  assert.equal(cmsCollections.status, 200);
  assert.equal(cmsCollections.headers["cache-control"], "no-store");
  assert.equal(cmsCollections.body.kind, "admin_cms_collections");
  assert.equal(cmsCollections.body.summary.records.listings, 165);
  assert.equal(cmsCollections.body.summary.records.listing_tours, 165);
  assert.equal(cmsCollections.body.collections.every((collection) => collection.publish_requires_human_review), true);
  assert.equal(payloadCollectionsUnauthorized.status, 401);
  assert.equal(payloadCollections.status, 200);
  assert.equal(payloadCollections.headers["cache-control"], "no-store");
  assert.equal(payloadCollections.body.kind, "admin_payload_collections");
  assert.equal(payloadCollections.body.collections.length, 8);
  assert.ok(payloadCollections.body.collections.some((collection) => collection.slug === "listings"));
  assert.equal(
    payloadCollections.body.collections.every((collection) => collection.versions === false || collection.versions.drafts),
    true,
  );
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported, 1);
  assert.equal(imported.body.approvals[0].old_url, importListing.old_url);
  assert.equal(imported.body.deployablePreview.length, 3);
  assert.equal(imported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(formImported.status, 201);
  assert.equal(formImported.body.imported, 1);
  assert.equal(formImported.body.deployablePreview.length, 4);
  assert.equal(formImported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  const pendingRows = parseCsv(pendingWorkbook.body);
  assert.equal(pendingRows.length, 453);
  assert.equal(pendingRows.some((row) => row.old_url === listing.old_url), false);
  assert.equal(pendingRows.some((row) => row.old_url === importRuListing.old_url), false);
  assert.equal(exportUnauthorized.status, 401);
  assert.equal(exported.status, 201);
  assert.equal(exported.body.exported, 4);
  assert.equal(exported.body.summary.total, 4);
  assert.equal(exported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(fs.existsSync(deployableRedirectOutputPath), true);
  assert.equal(JSON.parse(fs.readFileSync(deployableRedirectOutputPath, "utf8")).redirects.length, 4);
  assert.equal(review.body.workspace.locale, "ru");
  assert.equal(review.body.redirectApprovalImport.endpoint, "/api/admin/redirect-approvals/import");
  assert.equal(review.body.redirectApprovalImport.exportEndpoint, "/api/admin/deployable-redirects/export");
  assert.equal(review.body.redirectApprovalImport.workbookEndpoint, "/api/admin/redirect-approval-workbook");
  assert.equal(review.body.redirectApprovalImport.pendingWorkbookEndpoint, "/api/admin/redirect-approval-workbook?pending=1");
  assert.equal(review.body.listingQualityWorkbookEndpoint, "/api/admin/listing-quality-workbook");
  assert.equal(review.body.listingQualityReviewDraftEndpoint, "/api/admin/listing-quality-review-draft");
  assert.equal(review.body.listingQualityImportEndpoint, "/api/admin/listing-quality/import");
  assert.equal(review.body.launchReadinessEndpoint, "/api/admin/launch-readiness");
  assert.equal(review.body.launchReadinessExportEndpoint, "/api/admin/launch-readiness/export");
  assert.equal(review.body.launchInputChecklistEndpoint, "/api/admin/launch-input-checklist");
  assert.equal(review.body.preflightReportsEndpoint, "/api/admin/preflight-reports");
  assert.equal(review.body.seoPreflightEndpoint, "/api/admin/seo-preflight");
  assert.equal(review.body.liveServicesEndpoint, "/api/admin/live-services");
  assert.equal(review.body.liveServiceProvisioningEndpoint, "/api/admin/live-service-provisioning");
  assert.equal(review.body.liveServiceProvisioningImportEndpoint, "/api/admin/live-service-provisioning/import");
  assert.equal(review.body.liveServiceReportTemplateEndpoint, "/api/admin/live-service-report-template");
  assert.equal(review.body.liveServiceReportImportEndpoint, "/api/admin/live-service-reports/import");
  assert.equal(review.body.payloadRuntimeEndpoint, "/api/admin/payload-runtime");
  assert.equal(review.body.payloadRuntimeBootstrapEndpoint, "/api/admin/payload-runtime-bootstrap");
  assert.equal(review.body.payloadRuntimeImportEndpoint, "/api/admin/payload-runtime/import");
  assert.equal(review.body.productionRecoveryEndpoint, "/api/admin/production-recovery");
  assert.equal(review.body.productionRecoveryTemplateEndpoint, "/api/admin/production-recovery-template");
  assert.equal(review.body.productionRecoveryImportEndpoint, "/api/admin/production-recovery/import");
  assert.equal(review.body.cmsCollectionsEndpoint, "/api/admin/cms-collections");
  assert.equal(review.body.payloadCollectionsEndpoint, "/api/admin/payload-collections");
  assert.equal(review.body.listingQualityEndpoint, "/api/admin/listing-quality");
  assert.equal(review.body.agencyReviewQueue.deployment_mode, "production_review");
  assert.equal(review.body.agencyReviewQueue.review_after_deploy, true);
  assert.equal(review.body.agencyReviewQueue.public_launch_ready, false);
  assert.ok(review.body.agencyReviewQueue.summary.open_tasks > 0);
  assert.equal(review.body.agencyReviewQueue.guardrails.unreviewed_translation_indexing, "blocked");
  assert.equal(review.body.launchBlockers.blockers.includes("redirect_reviews"), false);
  assert.equal(review.body.launchBlockers.blockers.includes("external_seo_exports"), false);
  assert.equal(review.body.launchBlockers.blockers.includes("listing_quality_review"), false);
  assert.ok(review.body.launchBlockers.blockers.includes("live_services"));
  assert.ok(review.body.launchBlockers.blockers.includes("payload_runtime"));
  assert.ok(review.body.launchBlockers.blocked_gates.every((gate) => gate.next_actions.length > 0));
  const migrationReviewBlockers = review.body.launchBlockers.blockers.join(",");
  const migrationReviewActionCount = review.body.launchBlockers.blocked_gates.reduce((count, gate) => count + gate.next_actions.length, 0);
  assert.equal(review.body.listingQuality.generated_at, "2026-07-05T00:09:00Z");
  assert.equal(review.body.listingQuality.summary.listings, 165);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_price"), true);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_bedrooms"), true);
  assert.ok(review.body.listingQuality.summary.issue_counts.thin_public_gallery > 0);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_alt_text"), true);
  assert.ok(review.body.listingQuality.rows.every((row) => Number.isInteger(row.missing_alt_text_assets)));
  assert.ok(review.body.listingQuality.rows.some((row) => row.editor_path.includes("/admin/listings/edit?listingId=")));
  assert.equal(review.body.redirectApprovals.length, 4);
  assert.equal(review.body.deployablePreview.length, 4);
  assert.equal(reviewHtml.body.includes('data-redirect-import-endpoint="/api/admin/redirect-approvals/import"'), true);
  assert.equal(reviewHtml.body.includes('data-redirect-export-endpoint="/api/admin/deployable-redirects/export"'), true);
  assert.equal(reviewHtml.body.includes('data-redirect-workbook-endpoint="/api/admin/redirect-approval-workbook"'), true);
  assert.equal(reviewHtml.body.includes('data-pending-redirect-workbook-endpoint="/api/admin/redirect-approval-workbook?pending=1"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-status="blocked"'), true);
  assert.equal(
    reviewHtml.body.includes(`data-launch-blockers="${migrationReviewBlockers}"`),
    true,
  );
  assert.equal(reviewHtml.body.includes(`data-launch-action-count="${migrationReviewActionCount}"`), true);
  assert.equal(reviewHtml.body.includes('data-launch-readiness-endpoint="/api/admin/launch-readiness"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-readiness-export-endpoint="/api/admin/launch-readiness/export"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-input-checklist-endpoint="/api/admin/launch-input-checklist"'), true);
  assert.equal(reviewHtml.body.includes('data-preflight-reports-endpoint="/api/admin/preflight-reports"'), true);
  assert.equal(reviewHtml.body.includes('data-seo-preflight-endpoint="/api/admin/seo-preflight"'), true);
  assert.equal(reviewHtml.body.includes('data-live-services-endpoint="/api/admin/live-services"'), true);
  assert.equal(reviewHtml.body.includes('data-live-service-provisioning-endpoint="/api/admin/live-service-provisioning"'), true);
  assert.equal(
    reviewHtml.body.includes('data-live-service-provisioning-import-endpoint="/api/admin/live-service-provisioning/import"'),
    true,
  );
  assert.equal(reviewHtml.body.includes('data-live-service-report-import-endpoint="/api/admin/live-service-reports/import"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-runtime-endpoint="/api/admin/payload-runtime"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-runtime-bootstrap-endpoint="/api/admin/payload-runtime-bootstrap"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-runtime-import-endpoint="/api/admin/payload-runtime/import"'), true);
  assert.equal(reviewHtml.body.includes('data-production-recovery-endpoint="/api/admin/production-recovery"'), true);
  assert.equal(
    reviewHtml.body.includes('data-production-recovery-import-endpoint="/api/admin/production-recovery/import"'),
    true,
  );
  assert.equal(reviewHtml.body.includes('data-cms-collections-endpoint="/api/admin/cms-collections"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-collections-endpoint="/api/admin/payload-collections"'), true);
  assert.equal(reviewHtml.body.includes('data-listing-quality-endpoint="/api/admin/listing-quality"'), true);
  assert.equal(reviewHtml.body.includes('data-agency-review-queue="true"'), true);
  assert.equal(reviewHtml.body.includes('data-agency-review-status="open"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-workbook-endpoint="/api/admin/listing-quality-workbook"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-review-draft-endpoint="/api/admin/listing-quality-review-draft"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-import-endpoint="/api/admin/listing-quality/import"'), true);
  assert.equal(
    reviewHtml.body.includes(`data-quality-affected-listings="${review.body.listingQuality.summary.affected_listings}"`),
    true,
  );
  assert.equal(reviewHtml.body.includes('data-quality-listing="true"'), true);
  assert.equal(reviewHtml.body.includes('data-listing-quality-review-form="true"'), true);
  assert.equal(reviewHtml.body.includes('data-admin-runtime-evidence-form="live-service-provisioning"'), true);
  assert.equal(reviewHtml.body.includes('data-admin-runtime-evidence-form="live-service-reports"'), true);
  assert.equal(reviewHtml.body.includes('data-admin-runtime-evidence-form="payload-runtime"'), true);
  assert.equal(reviewHtml.body.includes('data-admin-runtime-evidence-form="production-recovery"'), true);
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.equal(auditRows.find((row) => row.action === "listing_quality_imported").object_id, inlineQualityReview.listing_id);
  assert.equal(
    auditRows.find((row) => row.action === "listing_quality_imported").metadata.source,
    "listing_quality_workbench",
  );
  assert.deepEqual(actionCounts(auditRows), {
    redirect_approval_created: 2,
    listing_quality_imported: 1,
    redirect_approvals_imported: 2,
    deployable_redirects_exported: 1,
  });
});

test("HTTP admin persists complete listing quality review CSV as launch evidence", async () => {
  const listingEditLedgerPath = tempDefaultListingEdits();
  const translationLedgerPath = tempTranslations();
  const listingQualityReviewPath = tempListingQualityReviewPath();
  const auditLogPath = tempAuditLog();
  const app = createHttpApp({
    listingEditLedgerPath,
    translationLedgerPath,
    listingQualityReviewPath,
    auditLogPath,
    editedAt: "2026-07-05T00:03:00Z",
  });
  const workbookCsv = fs.readFileSync(fromRoot("production", "data", "listing-quality-workbook.csv"), "utf8");
  const reviewCsv = completeListingQualityReviewCsv(workbookCsv);

  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: reviewCsv,
  });
  const readiness = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported, parseCsv(workbookCsv).length);
  assert.equal(imported.body.reviewPersisted, true);
  assert.equal(imported.body.reviewImport.ready, true);
  assert.equal(imported.body.reviewImport.status, "ready");
  assert.deepEqual(imported.body.reviewImport.pendingReviewSample, []);
  assert.equal(imported.body.reviewPath, listingQualityReviewPath);
  assert.equal(imported.body.reviewPersistenceError, "");
  assert.equal(imported.body.report.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(imported.body.report.blockers.includes("listing_quality_review"), false);
  assert.equal(fs.readFileSync(listingQualityReviewPath, "utf8"), reviewCsv);
  assert.equal(readiness.body.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(readiness.body.blockers.includes("listing_quality_review"), false);
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.deepEqual(actionCounts(auditRows), { listing_quality_imported: 1 });
});

test("HTTP app rejects invalid language requests", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/language-requests",
    body: { requestedLocale: "not a locale", requestedPath: "/x/" },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /BCP 47/);
});

test("HTTP app rejects malformed JSON request bodies", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    headers: SAME_ORIGIN_LEAD_HEADERS,
    body: "{bad",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Invalid JSON request body");
});

test("HTTP admin auth does not accept local smoke token in production without configured secret", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAdminToken = process.env.MS_REALTY_ADMIN_TOKEN;
  const oldAdminActor = process.env.MS_REALTY_ADMIN_ACTOR;
  const oldAdminCredentials = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    const app = createHttpApp();

    const defaultToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer local-admin-smoke" },
    });

    process.env.MS_REALTY_ADMIN_TOKEN = "real-admin-token";
    const wrongToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    const nearMatchToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer real-admin-token-extra" },
    });
    const configuredToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer real-admin-token" },
    });

    assert.equal(defaultToken.status, 401);
    assert.equal(wrongToken.status, 401);
    assert.equal(nearMatchToken.status, 401);
    assert.equal(configuredToken.status, 200);

    const sharedWrite = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/launch-readiness/export",
      headers: { authorization: "Bearer real-admin-token" },
    });
    assert.equal(sharedWrite.status, 403);
    assert.equal(sharedWrite.body.kind, "operator_identity_required");
    assert.equal(sharedWrite.headers["cache-control"], "no-store");

    const auditLogPath = tempAuditLog();
    const launchReadinessOutputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-auth-`)}/launch-readiness.json`;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "operations_lead", token: "operations-lead-token-0123456789", roles: ["admin"] },
    ]);
    const credentialApp = createHttpApp({ auditLogPath, launchReadinessOutputPath });
    const legacyAfterMigration = await dispatchHttp(credentialApp, {
      method: "POST",
      url: "/api/admin/launch-readiness/export",
      headers: { authorization: "Bearer real-admin-token" },
    });
    const credentialWrite = await dispatchHttp(credentialApp, {
      method: "POST",
      url: "/api/admin/launch-readiness/export",
      headers: { authorization: "Bearer operations-lead-token-0123456789" },
    });
    assert.equal(legacyAfterMigration.status, 401);
    assert.equal(credentialWrite.status, 201);
    assert.equal(readAuditLog(auditLogPath).at(-1).actor, "operations_lead");
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldAdminToken === undefined) delete process.env.MS_REALTY_ADMIN_TOKEN;
    else process.env.MS_REALTY_ADMIN_TOKEN = oldAdminToken;
    if (oldAdminActor === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
    else process.env.MS_REALTY_ADMIN_ACTOR = oldAdminActor;
    if (oldAdminCredentials === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = oldAdminCredentials;
  }
});

test("HTTP admin can import external SEO evidence without broad launch assumptions", async () => {
  const runtimeGeneratedAt = new Date().toISOString();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const com = routeMap.find((route) => route.url_type === "listing" && route.source_domain === "makler-realty.com");
  const ru = routeMap.find((route) => route.url_type === "listing" && route.source_domain === "makler-realty.ru");
  const seoEvidenceInputDir = tempSeoEvidenceDir();
  const seoEvidenceOutputPath = `${seoEvidenceInputDir}/seo-evidence.json`;
  const launchReadinessOutputPath = `${seoEvidenceInputDir}/launch-readiness.json`;
  const searchSyncReportPath = `${seoEvidenceInputDir}/postgres-search-sync-report.json`;
  const searchQueryReportPath = `${seoEvidenceInputDir}/postgres-search-query-report.json`;
  const hermesWorkerReportPath = `${seoEvidenceInputDir}/hermes-draft-worker-report.json`;
  const liveServiceProvisioningReportPath = `${seoEvidenceInputDir}/live-service-provisioning-report.json`;
  const payloadRuntimeReportPath = `${seoEvidenceInputDir}/payload-runtime-report.json`;
  const syncReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "postgres-search-sync-report.json.example"), "utf8"));
  const queryReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "postgres-search-query-report.json.example"), "utf8"));
  const hermesReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "hermes-draft-worker-report.json.example"), "utf8"));
  const payloadReport = await buildPayloadRuntimeReport({
    databaseProbe: async ({ database, host, port }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
      MS_REALTY_SEARCH_ENGINE: "postgres",
    },
    generatedAt: runtimeGeneratedAt,
  });
  const blockedPayloadReport = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: runtimeGeneratedAt,
  });
  const liveServiceProvisioningReport = await buildLiveServiceProvisioningReport({
    env: {
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
      MS_REALTY_SEARCH_ENGINE: "postgres",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: healthyHermesAgentFetch,
    generatedAt: runtimeGeneratedAt,
  });
  delete syncReport.example;
  delete queryReport.example;
  delete hermesReport.example;
  syncReport.generated_at = runtimeGeneratedAt;
  queryReport.generated_at = runtimeGeneratedAt;
  hermesReport.generated_at = runtimeGeneratedAt;
  syncReport.summary.database_target = "postgres://db.ms-realty.bg:5432/ms_realty";
  queryReport.summary.database_target = "postgres://db.ms-realty.bg:5432/ms_realty";
  for (const engine of syncReport.engines) {
    engine.operations = (engine.operations || []).map((operation) => ({
      ...operation,
      url: "postgres://db.ms-realty.bg:5432/ms_realty",
    }));
  }
  for (const engine of queryReport.engines) {
    engine.database_target = "postgres://db.ms-realty.bg:5432/ms_realty";
    engine.operation = {
      ...engine.operation,
      url: "postgres://db.ms-realty.bg:5432/ms_realty",
    };
  }
  hermesReport.provider.endpoint = "https://hermes.ms-realty.bg/v1/chat/completions";
  const app = createHttpApp({
    routeMap,
    seoEvidenceInputDir,
    seoEvidenceOutputPath,
    launchReadinessOutputPath,
    searchSyncReportPath,
    searchQueryReportPath,
    hermesWorkerReportPath,
    liveServiceProvisioningReportPath,
    monitoringRollbackReportPath: `${seoEvidenceInputDir}/missing-monitoring-rollback-report.json`,
    payloadRuntimeReportPath,
    reviewedAt: runtimeGeneratedAt,
  });

  const unauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    body: { source: "search_console", csv: "url,clicks\n" },
  });
  const templateUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=search_console",
  });
  const exportUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/export",
  });
  const template = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=search_console",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const badTemplate = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=unknown",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const invalidSearchConsole = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      source: "search_console",
      csv: `url,clicks,impressions,position\n${com.old_url},-3,30,7\n`,
    },
  });
  const invalidSearchConsolePersisted = fs.existsSync(`${seoEvidenceInputDir}/search-console.csv`);
  const searchConsole = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      source: "search_console",
      csv: `url,clicks,impressions,position\n${com.old_url},3,30,7\n${ru.old_url},2,20,8\n`,
    },
  });
  const yandex = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      source: "yandex_webmaster",
      csv: `url,indexed,issue\n${com.old_url},yes,\n${ru.old_url},yes,\n`,
    }).toString(),
  });
  const backlinks = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import?source=backlinks",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: `target_url,source_url,referring_domain\n${com.old_url},https://regionalbroker.bg/a,regionalbroker.bg\n${ru.old_url},https://partnerrealty.de/b,partnerrealty.de\n`,
  });
  const exportedEvidence = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const review = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const reviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const launchUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
  });
  const launch = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const launchExportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/launch-readiness/export",
  });
  const launchExport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/launch-readiness/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveTemplateUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-service-report-template?source=postgres_search_sync",
  });
  const liveTemplate = await dispatchHttp(app, {
    url: "/api/admin/live-service-report-template?source=postgres_search_sync",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=postgres_search_sync",
    body: syncReport,
  });
  const liveProvisioningImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-provisioning/import",
    body: liveServiceProvisioningReport,
  });
  const liveProvisioningImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-provisioning/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: liveServiceProvisioningReport,
  });
  const liveSyncImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=postgres_search_sync",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: syncReport,
  });
  const liveQueryImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=postgres_search_query",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: queryReport,
  });
  const liveHermesImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=hermes_draft_worker",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: hermesReport,
  });
  const payloadBlockedImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: blockedPayloadReport,
  });
  const payloadExampleImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: JSON.parse(fs.readFileSync("production/data/payload-runtime-report.json.example", "utf8")),
  });
  const payloadImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: payloadReport,
  });
  const launchAfterLive = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(templateUnauthorized.status, 401);
  assert.equal(exportUnauthorized.status, 401);
  assert.equal(template.status, 200);
  assert.equal(template.headers["content-type"], "text/csv; charset=utf-8");
  assert.match(template.body, /url,clicks,impressions,position/);
  assert.equal(badTemplate.status, 400);
  assert.equal(invalidSearchConsole.status, 400);
  assert.equal(invalidSearchConsolePersisted, false);
  assert.equal(searchConsole.status, 202);
  assert.equal(searchConsole.body.crawlCoverage.urls, 457);
  assert.deepEqual(searchConsole.body.crawlCoverage.urlTypes, { page: 104, post: 42, taxonomy: 146, listing: 165 });
  assert.ok(searchConsole.body.crawlCoverage.urlsWithAnyEvidence >= 2);
  assert.deepEqual(searchConsole.body.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
  assert.deepEqual(searchConsole.body.missingRequiredSources, ["yandex_webmaster", "backlinks"]);
  assert.equal(searchConsole.body.seoImport.ready, false);
  assert.equal(searchConsole.body.seoImport.status, "blocked");
  assert.equal(searchConsole.body.seoImport.importedSource, "search_console");
  assert.deepEqual(searchConsole.body.seoImport.missingRequiredSources, ["yandex_webmaster", "backlinks"]);
  assert.equal(searchConsole.body.report.gates.some((gate) => gate.id === "external_seo_exports"), false);
  assert.equal(searchConsole.body.report.blockers.includes("external_seo_exports"), false);
  assert.deepEqual(searchConsole.body.sources.search_console.matched_source_domains, [
    "makler-realty.com",
    "makler-realty.ru",
  ]);
  assert.equal(yandex.status, 202);
  assert.deepEqual(yandex.body.missingRequiredSources, ["backlinks"]);
  assert.equal(backlinks.status, 201);
  assert.deepEqual(backlinks.body.missingRequiredSources, []);
  assert.equal(backlinks.body.seoImport.ready, true);
  assert.equal(backlinks.body.seoImport.status, "ready");
  assert.deepEqual(backlinks.body.seoImport.missingRequiredSources, []);
  assert.equal(backlinks.body.report.gates.some((gate) => gate.id === "external_seo_exports"), false);
  assert.equal(backlinks.body.report.blockers.includes("external_seo_exports"), false);
  assert.equal(backlinks.body.exportEndpoint, "/api/admin/seo-evidence/export");
  assert.equal(exportedEvidence.status, 200);
  assert.equal(exportedEvidence.headers["content-disposition"], 'attachment; filename="seo-evidence.json"');
  const exportedEvidenceBody = JSON.parse(exportedEvidence.body);
  assert.deepEqual(exportedEvidenceBody.summary.missing_required_sources, ["privacy_or_ga4_analytics"]);
  assert.ok(exportedEvidenceBody.url_evidence.length > 0);
  assert.equal(fs.existsSync(seoEvidenceOutputPath), true);
  assert.equal(review.body.seoEvidence.importEndpoint, "/api/admin/seo-evidence/import");
  assert.equal(review.body.seoEvidence.templateEndpoint, "/api/admin/seo-evidence/template");
  assert.equal(review.body.seoEvidence.exportEndpoint, "/api/admin/seo-evidence/export");
  assert.equal(review.body.seoEvidence.crawlCoverage.urls, 457);
  assert.deepEqual(review.body.seoEvidence.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
  assert.deepEqual(review.body.seoEvidence.missingRequiredSources, ["privacy_or_ga4_analytics"]);
  assert.equal(reviewHtml.body.includes('data-seo-import-endpoint="/api/admin/seo-evidence/import"'), true);
  assert.equal(reviewHtml.body.includes('data-seo-template-endpoint="/api/admin/seo-evidence/template"'), true);
  assert.equal(launchUnauthorized.status, 401);
  assert.equal(launch.status, 200);
  assert.deepEqual(launch.body.blockers, [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "r2_media_coverage",
    "production_recovery",
  ]);
  assert.equal(launch.body.gates.some((gate) => gate.id === "external_seo_exports"), false);
  assert.equal(launch.body.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(launch.body.gates.find((gate) => gate.id === "live_services").status, "blocked");
  assert.equal(launch.body.gates.find((gate) => gate.id === "monitoring_rollback").evidence.machine_evidence.status, "missing");
  assert.equal(launch.body.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(launchExportUnauthorized.status, 401);
  assert.equal(launchExport.status, 201);
  assert.equal(fs.existsSync(launchReadinessOutputPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(launchReadinessOutputPath, "utf8")).blockers, [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "r2_media_coverage",
    "production_recovery",
  ]);
  assert.equal(liveTemplateUnauthorized.status, 401);
  assert.equal(liveTemplate.status, 200);
  assert.equal(liveTemplate.headers["content-disposition"], 'attachment; filename="postgres-search-sync-report.json.example"');
  assert.equal(JSON.parse(liveTemplate.body).example, true);
  assert.equal(JSON.parse(liveTemplate.body).summary.engines, 1);
  assert.equal(liveImportUnauthorized.status, 401);
  assert.equal(liveProvisioningImportUnauthorized.status, 401);
  assert.equal(liveProvisioningImport.status, 201);
  assert.equal(liveProvisioningImport.body.imported.outPath, liveServiceProvisioningReportPath);
  assert.equal(liveProvisioningImport.body.provisioning.status, "pass");
  assert.equal(liveProvisioningImport.body.provisioning.summary.missing_env.length, 0);
  assert.equal(liveSyncImport.status, 202);
  assert.equal(liveSyncImport.body.imported.outPath, searchSyncReportPath);
  assert.equal(liveSyncImport.body.livePreflight.status, "blocked");
  assert.equal(liveSyncImport.body.livePreflight.summary.pass, 1);
  assert.equal(liveSyncImport.body.livePreflight.summary.missing_report, 2);
  assert.equal(liveSyncImport.body.liveImport.ready, false);
  assert.equal(liveSyncImport.body.liveImport.status, "blocked");
  assert.equal(liveSyncImport.body.liveImport.importedSource, "postgres_search_sync");
  assert.deepEqual(
    liveSyncImport.body.liveImport.blockedReports.map((report) => report.source),
    ["postgres_search_query", "hermes_draft_worker"],
  );
  assert.equal(liveQueryImport.status, 202);
  assert.equal(liveHermesImport.status, 201);
  assert.equal(liveHermesImport.body.liveImport.ready, true);
  assert.equal(liveHermesImport.body.liveImport.status, "ready");
  assert.deepEqual(liveHermesImport.body.liveImport.blockedReports, []);
  assert.equal(liveHermesImport.body.livePreflight.ready, true);
  assert.equal(liveHermesImport.body.livePreflight.summary.pass, 3);
  assert.equal(payloadBlockedImport.status, 202);
  assert.equal(payloadBlockedImport.body.runtime.ready, false);
  assert.equal(payloadBlockedImport.body.runtime.status, "blocked");
  assert.deepEqual(payloadBlockedImport.body.runtime.missingEnv, ["PAYLOAD_SECRET", "DATABASE_URL"]);
  assert.deepEqual(payloadBlockedImport.body.runtime.placeholderEnv, []);
  assert.deepEqual(payloadBlockedImport.body.runtime.weakEnv, []);
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("payload_secret"));
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("database_url"));
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("database_tcp"));
  assert.equal(payloadBlockedImport.body.report.gates.find((gate) => gate.id === "payload_runtime").status, "blocked");
  assert.equal(payloadExampleImport.status, 400);
  assert.match(payloadExampleImport.body.message, /example reports cannot/);
  assert.equal(payloadImport.status, 201);
  assert.equal(payloadImport.body.imported.outPath, payloadRuntimeReportPath);
  assert.equal(payloadImport.body.runtime.ready, true);
  assert.deepEqual(payloadImport.body.runtime.blockedChecks, []);
  assert.equal(fs.existsSync(searchSyncReportPath), true);
  assert.equal(fs.existsSync(searchQueryReportPath), true);
  assert.equal(fs.existsSync(hermesWorkerReportPath), true);
  assert.equal(fs.existsSync(liveServiceProvisioningReportPath), true);
  assert.equal(fs.existsSync(payloadRuntimeReportPath), true);
  assert.deepEqual(launchAfterLive.body.blockers, [
    "monitoring_rollback",
    "r2_media_coverage",
    "production_recovery",
  ]);
  assert.equal(launchAfterLive.body.status, "blocked");
});

test("HTTP app only redirects rows in the reviewed deployable export", async () => {
  const app = createHttpApp();
  const approved = deployableRedirect();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const notDeployable = routeMap.find((route) => route.url_type === "taxonomy" && route.old_url);

  assert.equal((await dispatchHttp(app, { url: approved.old_url })).status, 301);
  assert.notEqual((await dispatchHttp(app, { url: notDeployable.old_url })).status, 301);
});

test("HTTP app executes reviewed retained and 410 legacy route decisions", async () => {
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const page = routeMap.find((route) => route.url_type === "page" && route.old_url !== "https://makler-realty.com");
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");
  const app = createHttpApp({
    ...approvedPublicSeedFixtureOptions(),
    redirects: [
      { old_url: taxonomy.old_url, status: 410, source_domain: taxonomy.source_domain, reviewer: "seo_editor", reason: "Reviewed obsolete." },
      {
        old_url: page.old_url,
        status: 200,
        target_path: listing.target_path,
        source_domain: page.source_domain,
        reviewer: "seo_editor",
        reason: "Reviewed equivalent public content.",
      },
    ],
  });

  const gone = await dispatchHttp(app, { url: taxonomy.old_url });
  const retained = await dispatchHttp(app, { url: page.old_url });

  assert.equal(gone.status, 410);
  assert.equal(gone.body.kind, "legacy_gone");
  assert.equal(retained.status, 200);
  assert.equal(retained.body.kind, "listing");
  assert.equal(retained.body.body.facts.id, listing.target_path.split("/").at(-1));
});

test("HTTP launch readiness stays tied to the approved freeze while editor approvals change", async () => {
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-stale-redirect-artifact-`);
  const redirectApprovalPath = `${directory}/redirect-approvals.jsonl`;
  fs.copyFileSync(fromRoot("production", "data", "redirect-approvals.jsonl"), redirectApprovalPath);
  for (const route of routeMap.filter((row) => !row.target_path)) {
    appendRedirectApproval(routeMap, {
      oldUrl: route.old_url,
      decision: "approved_410",
      reviewer: "fixture_seo_editor",
      reason: "Test-only reviewed terminal decision.",
    }, { filePath: redirectApprovalPath, approvedAt: "2026-07-13T00:00:00Z" });
  }

  const app = createHttpApp({ redirectApprovalPath });
  const readiness = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const redirectGate = readiness.body.gates.find((gate) => gate.id === "redirect_reviews");

  assert.equal(readiness.status, 200);
  assert.equal(redirectGate.status, "pass");
  assert.equal(redirectGate.evidence.terminal_decisions, 457);
  assert.equal(redirectGate.evidence.unresolved_legacy_urls, 0);
  assert.equal(redirectGate.evidence.preservation_contract_valid, true);
});

test("HTTP sitemap ignores editor-only location mutations without removing reviewed landing pages", async () => {
  const listingEditLedgerPath = tempListingEdits();
  fs.appendFileSync(
    listingEditLedgerPath,
    `${JSON.stringify({
      listing_id: "MS-CRAWL-0001",
      editor: "seo_editor",
      patch: { location: "Runtime Only City" },
      source_hash_after: "runtime-only-city",
      stale_translation_count: 1,
    })}\n`,
  );
  const sitemap = await dispatchHttp(createHttpApp({ seed: approvedPublicSeedFixture(), listingEditLedgerPath }), { url: "/sitemap.xml" });

  assert.equal(sitemap.status, 200);
  assert.doesNotMatch(sitemap.body, /\/he\/locations\/runtime-only-city/);
  // The reviewed settlement landing pages survive the editor-only mutation.
  assert.match(sitemap.body, /\/he\/locations\/sandanski/);
  assert.match(sitemap.body, /\/bg\/lokacii\/sandanski/);
});

test("HTTP app rejects unknown buyer listing references", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    headers: SAME_ORIGIN_LEAD_HEADERS,
    body: {
      id: "bad-lead-test",
      leadType: "buyer",
      language: "he",
      listingReference: "missing",
      contact: { name: "Noa Levi", phone: "+359880000001" },
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /known listingReference/);
});

test("HTTP admin can add a non-indexable website locale without changing admin languages", async () => {
  const localeRegistryPath = tempRegistry();
  const app = createHttpApp({ registry: loadLocaleRegistry(localeRegistryPath), localeRegistryPath });

  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "es",
      native_name: "Español",
      admin_name: "Spanish",
      route_segments: { listing: "propiedades", search: "buscar" },
    },
  });
  const listed = await dispatchHttp(app, {
    url: "/api/admin/locales?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const invalidFallback = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "it",
      native_name: "Italiano",
      fallback_locale: "fr",
    },
  });
  const fallback = await dispatchHttp(app, { url: "/es/" });
  const stored = loadLocaleRegistry(localeRegistryPath);

  assert.equal(created.status, 201);
  assert.equal(created.body.locale.code, "es");
  assert.equal(created.body.locale.public_enabled, false);
  assert.equal(created.body.locale.indexable, false);
  assert.deepEqual(created.body.required_admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(created.body.admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(created.body.required_public_locales, ["bg", "en", "de", "nl", "ru", "el", "he"]);
  assert.equal(created.body.website_language_coverage.find((item) => item.market === "Israel").locale, "he");
  assert.equal(created.body.website_language_coverage.find((item) => item.market === "Greece").locale, "el");
  assert.equal(invalidFallback.status, 400);
  assert.match(invalidFallback.body.message, /must be public and indexable/);
  assert.equal(listed.body.workspace.locale, "ru");
  assert.equal(listed.body.locales.some((locale) => locale.code === "es"), true);
  assert.equal(fallback.body.locale, "en");
  assert.equal(fallback.body.indexable, false);
  assert.equal(stored.locales.some((locale) => locale.code === "es"), true);
});

test("HTTP admin can publish an approved translation for a newly added public locale", async () => {
  const localeRegistryPath = tempRegistry();
  const translationLedgerPath = tempTranslations();
  const app = createHttpApp({
    ...approvedPublicSeedFixtureOptions(),
    registry: loadLocaleRegistry(localeRegistryPath),
    localeRegistryPath,
    translationLedgerPath,
  });

  await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "es",
      native_name: "Español",
      admin_name: "Spanish",
      public_enabled: true,
      indexable: true,
      route_segments: { listing: "propiedades", search: "buscar" },
    },
  });
  const draft = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/draft",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      objectType: "listing",
      objectId: "MS-CRAWL-0001",
      sourceLocale: "bg",
      targetLocale: "es",
      sourceContent: {
        title: "Reviewed listing title",
        description: "Reviewed listing description for Sandanski.",
      },
      propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
      draftOutput: hermesDraftOutput({ id: "MS-CRAWL-0001", location: "Sandanski" }, "es"),
    },
  });
  const approve = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/approve",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: draft.body.id,
      reviewer: "translator_es",
      approvedAt: "2026-07-05T00:00:00Z",
    },
  });
  const publish = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/publish",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: approve.body.id,
    },
  });
  const page = await dispatchHttp(app, { url: "/es/propiedades/MS-CRAWL-0001" });
  const sitemap = await dispatchHttp(app, { url: "/sitemap.xml" });
  const search = await dispatchHttp(app, { url: "/api/search?locale=es&q=Sandanski" });
  const card = search.body.cards.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(draft.status, 201);
  assert.equal(approve.status, 201);
  assert.equal(publish.status, 201);
  assert.equal(page.status, 200);
  assert.equal(page.body.locale, "es");
  assert.equal(page.body.indexable, true);
  assert.equal(page.body.hreflang.some((link) => link.hreflang === "es"), true);
  assert.match(sitemap.body, /\/es\/propiedades\/MS-CRAWL-0001/);
  assert.equal(search.body.path, "/es/buscar");
  assert.equal(card.path, "/es/propiedades/MS-CRAWL-0001");
  assert.equal(card.translation_display, "reviewed_translation");
  assert.equal(card.translation_indexable, true);
});

test("HTTP fallback accepts a URL-encoded seller valuation form", async () => {
  const leadLedgerPath = tempLedger();
  const sellerPipelinePath = tempSellerPipeline();
  const app = createHttpApp({
    registry: loadLocaleRegistry(),
    leadLedgerPath,
    sellerPipelinePath,
    consentLedgerPath: tempConsents(),
    eventLedgerPath: tempEvents(),
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    headers: { ...SAME_ORIGIN_LEAD_HEADERS, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      source: "website_seller_valuation",
      leadType: "seller",
      language: "bg",
      "contact.name": "Mira Petkova",
      "contact.phone": "+359880000000",
      contact_preference: "phone",
      "property.location": "Sandanski",
      "property.type": "apartment",
      message: "Please arrange a broker valuation.",
    }).toString(),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body.lead.property, { location: "Sandanski", type: "apartment" });
  assert.deepEqual(response.body.sellerPipeline.property, { location: "Sandanski", type: "apartment" });
  assert.deepEqual(readLeadLedger(leadLedgerPath)[0].property, { location: "Sandanski", type: "apartment" });
});

test("HTTP admin records private seller valuation outcomes with a derived queue", async () => {
  const leadLedgerPath = tempLedger();
  const sellerPipelinePath = tempSellerPipeline();
  const sellerPipelineOutcomeLedgerPath = tempSellerPipelineOutcomes();
  const auditLogPath = tempAuditLog();
  const app = createHttpApp({
    registry: loadLocaleRegistry(),
    leadLedgerPath,
    sellerPipelinePath,
    sellerPipelineOutcomeLedgerPath,
    auditLogPath,
    sellerPipelineCreatedAt: "2026-07-10T08:00:00Z",
    sellerPipelineOutcomeAt: "2026-07-10T09:00:00Z",
  });
  const sellerLead = await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    headers: SAME_ORIGIN_LEAD_HEADERS,
    body: {
      id: "http-seller-outcome",
      source: "website_seller_valuation",
      leadType: "seller",
      language: "bg",
      contact: { name: "Mira Petkova", phone: "+359880000001" },
      property: { location: "Sandanski", type: "apartment" },
    },
  });
  const input = {
    id: "http-seller-callback",
    sellerPipelineId: sellerLead.body.sellerPipeline.id,
    actor: "broker_bg",
    action: "callback_completed",
    note: "Internal callback note.",
  };

  const unauthorized = await dispatchHttp(app, { method: "POST", url: "/api/admin/seller-pipeline/outcome", body: input });
  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seller-pipeline/outcome",
    headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(input).toString(),
  });
  const retry = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seller-pipeline/outcome",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: input,
  });
  const inbox = await dispatchHttp(app, { url: "/api/admin/leads", headers: { authorization: "Bearer local-admin-smoke" } });

  assert.equal(unauthorized.status, 401);
  assert.equal(created.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(inbox.body.sellerPipelineQueue.rows[0].task, "appraisal");
  assert.equal(assertSellerPipelineOutcomes(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath)), true);
  const audits = readAuditLog(auditLogPath).filter((row) => row.action === "seller_pipeline_outcome_recorded");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.note, undefined);
  assert.equal(audits[0].metadata.property, undefined);
});

test("HTTP credentialed seller outcomes cannot spoof the workflow actor", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "broker_bg", token: "broker-bg-production-token-0123456789", roles: ["broker"] },
    ]);

    const leadLedgerPath = tempLedger();
    const sellerPipelinePath = tempSellerPipeline();
    const sellerPipelineOutcomeLedgerPath = tempSellerPipelineOutcomes();
    const auditLogPath = tempAuditLog();
    const app = createHttpApp({
      registry: loadLocaleRegistry(),
      leadLedgerPath,
      sellerPipelinePath,
      sellerPipelineOutcomeLedgerPath,
      auditLogPath,
      sellerPipelineCreatedAt: "2026-07-10T08:00:00Z",
      sellerPipelineOutcomeAt: "2026-07-10T09:00:00Z",
    });
    const sellerLead = await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      headers: SAME_ORIGIN_LEAD_HEADERS,
      body: {
        id: "credentialed-seller-outcome",
        source: "website_seller_valuation",
        leadType: "seller",
        language: "bg",
        contact: { name: "Mira Petkova", phone: "+359880000001" },
        property: { location: "Sandanski", type: "apartment" },
      },
    });
    const base = {
      id: "credentialed-seller-callback",
      sellerPipelineId: sellerLead.body.sellerPipeline.id,
      action: "callback_completed",
      note: "Internal callback note.",
    };
    const mismatch = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers: { authorization: "Bearer broker-bg-production-token-0123456789" },
      body: { ...base, actor: "broker_ru" },
    });
    const created = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers: { authorization: "Bearer broker-bg-production-token-0123456789" },
      body: base,
    });
    const inbox = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer broker-bg-production-token-0123456789" },
    });

    assert.equal(mismatch.status, 400);
    assert.match(mismatch.body.message, /must match the authenticated operator/);
    assert.equal(created.status, 201);
    assert.equal(created.body.outcome.actor, "broker_bg");
    assert.equal(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath)[0].actor, "broker_bg");
    assert.equal(readAuditLog(auditLogPath).at(-1).actor, "broker_bg");
    assert.equal(inbox.body.workspace.operator_id, "broker_bg");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("HTTP public approval handlers bind reviewers and require confirmation", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "media_editor", token: "media-editor-production-token-0123456789", roles: ["admin"] },
    ]);

    const auditLogPath = tempAuditLog();
    const app = createHttpApp({
      auditLogPath,
      brokerContactLedgerPath: tempBrokerContacts(),
      tourApprovalLedgerPath: tempTourApprovals(),
      reviewedAt: "2026-07-29T10:05:00Z",
    });
    const headers = { authorization: "Bearer media-editor-production-token-0123456789" };
    const contact = {
      id: "credentialed-broker-contact",
      listingId: "MS-CRAWL-0001",
      broker: "broker_bg",
      phone: "+359880123456",
      sourceReference: "test://broker-contact/MS-CRAWL-0001",
      validationStatus: "broker_verified",
      approved: true,
    };
    const spoofedContact = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/broker-contacts",
      headers,
      body: { ...contact, reviewer: "someone_else" },
    });
    const unconfirmedContact = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/broker-contacts",
      headers,
      body: { ...contact, approved: false },
    });
    const savedContact = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/broker-contacts",
      headers,
      body: contact,
    });
    const tour = {
      id: "credentialed-tour-approval",
      listingId: "MS-CRAWL-0001",
      panoramaUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/MS-CRAWL-0001.jpg",
      accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
      reviewConfirmed: true,
    };
    const spoofedTour = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/tours/approve",
      headers,
      body: { ...tour, reviewer: "someone_else" },
    });
    const unconfirmedTour = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/tours/approve",
      headers,
      body: { ...tour, reviewConfirmed: false },
    });
    const savedTour = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/tours/approve",
      headers,
      body: tour,
    });

    assert.equal(spoofedContact.status, 400);
    assert.match(spoofedContact.body.message, /Submitted reviewer must match the authenticated operator/);
    assert.equal(unconfirmedContact.status, 400);
    assert.match(unconfirmedContact.body.message, /explicitly approved/);
    assert.equal(savedContact.status, 201);
    assert.equal(savedContact.body.reviewer, "media_editor");
    assert.equal(spoofedTour.status, 400);
    assert.match(spoofedTour.body.message, /Submitted reviewer must match the authenticated operator/);
    assert.equal(unconfirmedTour.status, 400);
    assert.match(unconfirmedTour.body.message, /explicit human confirmation/);
    assert.equal(savedTour.status, 201);
    assert.equal(savedTour.body.reviewer, "media_editor");
    assert.deepEqual(
      readAuditLog(auditLogPath).map((row) => [row.action, row.actor]),
      [
        ["broker_contact_approved", "media_editor"],
        ["tour_approved", "media_editor"],
      ],
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("HTTP fallback accepts a URL-encoded saved-search form", async () => {
  const savedSearchLedgerPath = tempSavedSearches();
  const publicContactVaultPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-saved-contact-`)}/contacts.jsonl`;
  const publicContactKey = "test-only-http-saved-contact-key-32-characters";
  const app = createHttpApp({
    registry: loadLocaleRegistry(),
    savedSearchLedgerPath,
    publicContactVaultPath,
    publicContactKey,
    consentLedgerPath: tempConsents(),
    translationLedgerPath: tempTranslations(),
    savedAt: "2026-07-13T00:00:00Z",
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      locale: "he",
      query: "",
      filters: JSON.stringify({ property_type: "apartment" }),
      "contact.name": "Noa Levi",
      "contact.whatsapp": "+359880000001",
      contact_preference: "whatsapp",
      alertConsent: "true",
    }).toString(),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body.filters, { property_type: "apartment" });
  assert.equal(response.body.contact, undefined);
  assert.equal(response.body.contact_preference, "whatsapp");
  assert.equal(readSavedSearches(savedSearchLedgerPath)[0].contact, undefined);
  assert.equal(readPublicContacts(publicContactVaultPath, publicContactKey, "saved_search").size, 1);
});

test("HTTP public delivery requests fail closed when private contact storage is unavailable", async () => {
  const app = createHttpApp({
    savedSearchLedgerPath: `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-no-contact-vault-`)}/saved-searches.jsonl`,
    languageRequestPath: `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-no-language-vault-`)}/language-requests.jsonl`,
  });
  const savedSearch = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    body: {
      locale: "en",
      query: "Sandanski",
      contact: { name: "Buyer", email: "buyer@example.test" },
      contact_preference: "email",
      alertConsent: true,
    },
  });
  const languageRequest = await dispatchHttp(app, {
    method: "POST",
    url: "/api/language-requests",
    body: {
      requestedLocale: "fr",
      requestedPath: "/fr/",
      contact: { name: "Buyer", email: "buyer@example.test" },
    },
  });

  assert.equal(savedSearch.status, 400);
  assert.equal(languageRequest.status, 400);
  assert.match(savedSearch.body.message, /delivery storage is not configured/);
  assert.match(languageRequest.body.message, /delivery storage is not configured/);
});

test("HTTP admin validates and audits production recovery evidence intake", async () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-production-recovery-`);
  const productionRecoveryReportPath = `${directory}/private/production-recovery-report.json`;
  const auditLogPath = tempAuditLog();
  const app = createHttpApp({
    auditLogPath,
    productionRecoveryReportPath,
    productionRecoverySigningPublicKey: RECOVERY_PUBLIC_KEY,
    reviewedAt: "2026-07-23T00:00:00.000Z",
    // Pin the freshness clock to the fixture's own date. Without this the test
    // passes for thirty days after that date and then fails on the calendar.
    productionRecoveryAt: "2026-07-23T00:00:00.000Z",
  });
  const auth = { authorization: "Bearer local-admin-smoke" };

  const unauthorized = await dispatchHttp(app, { url: "/api/admin/production-recovery" });
  const before = await dispatchHttp(app, { url: "/api/admin/production-recovery", headers: auth });
  const template = await dispatchHttp(app, { url: "/api/admin/production-recovery-template", headers: auth });
  const invalid = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/production-recovery/import",
    headers: auth,
    body: { report: "not-json" },
  });
  const legacy = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/production-recovery/import",
    headers: auth,
    body: { report: JSON.stringify({ ...validProductionRecoveryReport(), schema_version: 1 }) },
  });
  const unsignedReport = validProductionRecoveryReport();
  delete unsignedReport.provenance;
  const unsigned = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/production-recovery/import",
    headers: auth,
    body: { report: JSON.stringify(unsignedReport) },
  });
  const tamperedReport = validProductionRecoveryReport();
  tamperedReport.backup.backup_id = "handwritten-backup-9999";
  const tampered = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/production-recovery/import",
    headers: auth,
    body: { report: JSON.stringify(tamperedReport) },
  });
  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/production-recovery/import",
    headers: auth,
    body: { report: JSON.stringify(validProductionRecoveryReport("2026-07-22T23:40:00.000Z")) },
  });
  const reviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=en",
    headers: auth,
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(before.status, 200);
  assert.equal(before.body.kind, "admin_production_recovery");
  assert.equal(before.body.recovery.status, "missing_report");
  assert.equal(template.status, 200);
  assert.equal(template.headers["content-disposition"], 'attachment; filename="production-recovery-report.json.example"');
  assert.equal(unsigned.status, 400);
  assert.match(unsigned.body.message, /Ed25519 provenance/);
  assert.equal(tampered.status, 400);
  assert.match(tampered.body.message, /signature is invalid/);
  assert.equal(JSON.parse(template.body).example, true);
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.message, /valid JSON/);
  assert.equal(legacy.status, 400);
  assert.match(legacy.body.message, /schema v2/);
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported.outPath, productionRecoveryReportPath);
  assert.equal(imported.body.recovery.status, "pass");
  assert.equal(imported.body.report.gates.find((gate) => gate.id === "production_recovery").status, "pass");
  assert.equal(fs.existsSync(productionRecoveryReportPath), true);
  assert.equal(reviewHtml.body.includes('data-production-recovery-import-endpoint="/api/admin/production-recovery/import"'), true);
  assert.equal(reviewHtml.body.includes('data-admin-runtime-evidence-form="production-recovery"'), true);

  const audit = readAuditLog(auditLogPath).find((row) => row.action === "production_recovery_report_imported");
  assert.equal(assertAuditLog(readAuditLog(auditLogPath)), true);
  assert.equal(audit.object_id, "backup-20260722-001");
  assert.equal(audit.metadata.drill_id, "restore-20260722-001");
  assert.equal(audit.metadata.status, "pass");
});

test("generated HTTP smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "http-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertHttpSmoke(smoke), true);
});
