import fs from "node:fs";
import { parseCsv } from "./csv.mjs";
import { launchBlockerSummary } from "./launch-readiness.mjs";
import { liveServiceProvisioningState } from "./live-service-provisioning.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT = fromRoot("production", "data", "launch-input-checklist.md");

const SEO_EXPORTS = {
  search_console: {
    filename: "search-console.csv",
    columns: "url,clicks,impressions,position",
  },
  yandex_webmaster: {
    filename: "yandex-webmaster.csv",
    columns: "url,indexed,issue",
  },
  backlinks: {
    filename: "backlinks.csv",
    columns: "target_url,source_url,referring_domain",
  },
};
const REQUIRED_SOURCE_DOMAINS = ["makler-realty.com", "makler-realty.ru"];

function rowCount(csvText) {
  return parseCsv(csvText).length;
}

function defaultListingVerification() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "listing-verification-report.json"), "utf8"));
}

function sourceLine(source, summary) {
  const state = summary.sources[source];
  const filename = SEO_EXPORTS[source].filename;
  const domains = (state.matched_source_domains || []).join(", ") || "none";
  const signalDomains = (state.signal_source_domains || []).join(", ") || "none";
  return `- \`migration/external/seo/${filename}\`: ${state.status}, rows ${state.row_count}, matched ${state.matched_rows}, signal ${state.signal_rows}, unmatched ${state.unmatched_rows}, duplicates ${state.duplicate_rows}, placeholders ${state.placeholder_rows}, domains: ${domains}, signal domains: ${signalDomains}`;
}

function importLine(source) {
  return `- \`POST /api/admin/seo-evidence/import?source=${source}\`: \`${SEO_EXPORTS[source].columns}\``;
}

function sourceDomainSampleLines(seoEvidence) {
  return REQUIRED_SOURCE_DOMAINS.map((domain) => {
    const sample = (seoEvidence.url_evidence || []).find((row) => row.source_domain === domain)?.old_url || "missing";
    return `- ${domain}: \`${sample}\``;
  }).join("\n");
}

function seoCoverageLine(summary) {
  const types = Object.entries(summary.url_types || {})
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
  return `- Crawl coverage: ${summary.crawl_urls} URLs${types ? ` (${types})` : ""}; URLs with any evidence: ${summary.urls_with_any_evidence}`;
}

function missingSeoSourcesLine(evidence) {
  const missing = Array.isArray(evidence.missing_required_sources) ? evidence.missing_required_sources : [];
  return missing.length ? missing.join(", ") : "none";
}

function liveServiceReportLine(report) {
  const details = [
    report.path ? `path ${report.path}` : "",
    report.error ? `error ${report.error}` : "",
  ].filter(Boolean);
  return `- ${report.source}: ${report.status}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function liveServiceReportLines(liveEvidence) {
  const reports = Array.isArray(liveEvidence.reports) ? liveEvidence.reports : [];
  if (!reports.length) return ["- no live service report rows available"];
  return reports.map(liveServiceReportLine);
}

function liveServiceProvisioningLine(provisioning) {
  const summary = provisioning.summary || {};
  const details = [
    provisioning.path ? `path ${provisioning.path}` : "",
    Array.isArray(summary.missing_env) && summary.missing_env.length ? `missing ${summary.missing_env.join(", ")}` : "",
    Array.isArray(summary.placeholder_env) && summary.placeholder_env.length
      ? `placeholders ${summary.placeholder_env.join(", ")}`
      : "",
  ].filter(Boolean);
  return `- ${provisioning.status || "unknown"}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function monitoringRollbackEvidenceLine(evidence) {
  const details = [
    evidence.path ? `path ${evidence.path}` : "",
    Number.isFinite(evidence.age_ms) ? `age ${evidence.age_ms}ms` : "",
    Number.isFinite(evidence.evidence_age_ms) ? `oldest proof ${evidence.evidence_age_ms}ms` : "",
    Number.isFinite(evidence.max_age_ms) ? `maximum age ${evidence.max_age_ms}ms` : "",
    evidence.error ? `error ${evidence.error}` : "",
  ].filter(Boolean);
  return `- ${evidence.status || "unknown"}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function payloadCheckLine(check) {
  const details = [
    check.env ? `env ${check.env}` : "",
    check.file ? `file ${check.file}` : "",
    check.error ? `error ${check.error}` : "",
  ].filter(Boolean);
  return `- ${check.id}: ${check.status}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function payloadCheckLines(payloadEvidence) {
  const checks = Array.isArray(payloadEvidence.checks) ? payloadEvidence.checks : [];
  if (!checks.length) return ["- no Payload runtime check rows available"];
  const failing = checks.filter((check) => check.status !== "pass");
  return (failing.length ? failing : checks).map(payloadCheckLine);
}

function listingReviewEvidenceLine(evidence) {
  const summary = evidence.summary || {};
  const details = [
    evidence.path ? `path ${evidence.path}` : "",
    Number.isInteger(summary.expected_review_rows) ? `expected ${summary.expected_review_rows}` : "",
    Number.isInteger(summary.review_rows) ? `reviewed ${summary.review_rows}` : "",
    Number.isInteger(summary.missing_review_rows) ? `missing ${summary.missing_review_rows}` : "",
    evidence.error ? `error ${evidence.error}` : "",
  ].filter(Boolean);
  return `- ${evidence.status || "unknown"}${details.length ? ` (${details.join("; ")})` : ""}`;
}

function listingPendingReviewLines(evidence) {
  const rows = Array.isArray(evidence.pending_review_sample) ? evidence.pending_review_sample : [];
  if (!rows.length) return "- none";
  return rows
    .map((row) => {
      const fields = Array.isArray(row.required_editor_fields) ? row.required_editor_fields.join("|") : "unknown";
      const issues = Array.isArray(row.issues) ? row.issues.join("|") : "unknown";
      return `- ${row.listing_id}: ${fields} (${issues}) ${row.editor_path}`;
    })
    .join("\n");
}

function blockedGateActionLines(launchReadiness) {
  const actions = launchBlockerSummary(launchReadiness).blocked_gates.flatMap((gate) =>
    gate.next_actions.map((action) => `- ${gate.id}: ${action}`),
  );
  return actions.length ? actions.join("\n") : "- none";
}

export function renderLaunchInputChecklist({
  generatedAt,
  launchReadiness,
  seoEvidence,
  redirectWorkbookCsv,
  deployableRedirects,
  routeMap,
  listingVerification = defaultListingVerification(),
  liveServiceProvisioning = liveServiceProvisioningState(),
}) {
  const redirectEvidence = launchReadiness.gates.find((gate) => gate.id === "redirect_reviews")?.evidence || {};
  const totalLegacyUrls = redirectEvidence.total_legacy_urls ?? routeMap.summary.total ?? 0;
  const resolvedLegacyUrls = redirectEvidence.resolved_legacy_urls ?? deployableRedirects.summary.total;
  const unresolvedLegacyUrls = redirectEvidence.unresolved_legacy_urls ?? Math.max(totalLegacyUrls - resolvedLegacyUrls, 0);
  const unresolvedByType = Object.entries(redirectEvidence.unresolved_by_type || {})
    .map(([type, count]) => `${type} ${count}`)
    .join(", ") || "none";
  const approved = deployableRedirects.summary.total;
  const terminalDecisions = redirectEvidence.terminal_decisions ?? deployableRedirects.decision_summary?.total ?? approved;
  const remaining = Math.max(totalLegacyUrls - terminalDecisions, 0);
  const decisionStatuses = redirectEvidence.decision_statuses || deployableRedirects.decision_summary?.byStatus || {};
  const workbookRows = rowCount(redirectWorkbookCsv);
  const verificationOwners = Object.entries(listingVerification.summary.by_owner || {})
    .map(([owner, count]) => `${owner}: ${count}`)
    .join(", ");
  const payloadGate = launchReadiness.gates.find((gate) => gate.id === "payload_runtime");
  const payloadEvidence = payloadGate?.evidence || {};
  const payloadSummary = payloadEvidence.summary || {};
  const missingPayloadEnv = Array.isArray(payloadSummary.missing_env)
    ? payloadSummary.missing_env
    : [
        payloadEvidence.payload_secret_configured ? "" : "PAYLOAD_SECRET",
        payloadEvidence.payload_database_url_configured ? "" : "DATABASE_URL",
      ].filter(Boolean);
  const weakPayloadEnv = Array.isArray(payloadSummary.weak_env) ? payloadSummary.weak_env : [];
  const liveServiceGate = launchReadiness.gates.find((gate) => gate.id === "live_services");
  const liveServiceEvidence = liveServiceGate?.evidence || {};
  const listingQualityGate = launchReadiness.gates.find((gate) => gate.id === "listing_quality_review");
  const listingReviewEvidence = listingQualityGate?.evidence || {};
  const seoGate = launchReadiness.gates.find((gate) => gate.id === "external_seo_exports");
  const seoGateEvidence = seoGate?.evidence || {};
  const recoveryGate = launchReadiness.gates.find((gate) => gate.id === "production_recovery");
  const recoveryEvidence = recoveryGate?.evidence || {};
  const monitoringGate = launchReadiness.gates.find((gate) => gate.id === "monitoring_rollback");
  const monitoringEvidence = monitoringGate?.evidence?.machine_evidence || {};

  return `# Launch Input Checklist

Generated: ${generatedAt}

Status: ${launchReadiness.status}
Blockers: ${launchReadiness.blockers.join(", ") || "none"}

## Blocked Gate Actions

${blockedGateActionLines(launchReadiness)}

## Redirect Reviews

- Workbook: \`production/data/redirect-approval-workbook.csv\`
- Legacy route decision workbook rows: ${workbookRows}
- Reviewed one-hop 301 redirects: ${approved}
- Terminal route decisions: ${terminalDecisions}/${totalLegacyUrls} (200: ${decisionStatuses[200] || 0}, 301: ${decisionStatuses[301] || 0}, 410: ${decisionStatuses[410] || 0})
- Remaining terminal route decisions: ${remaining}
- Legacy route coverage: ${resolvedLegacyUrls}/${totalLegacyUrls}
- Unresolved legacy URLs: ${unresolvedLegacyUrls} (${unresolvedByType})
- Import path: \`migration/reviews/redirect-approvals.csv\`
- Admin import endpoint: \`POST /api/admin/redirect-approvals/import\`
- Admin workbook endpoint: \`GET /api/admin/redirect-approval-workbook?pending=1\`
- Production adapter path overrides: \`MS_REALTY_REDIRECT_APPROVALS_PATH\`, \`MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH\`
- Review helper columns: \`decision\`, \`target_path\`, \`target_listing_id\`, \`review_status\`, \`same_content_checklist\`
- Approval import columns: \`old_url\`, \`decision\`, \`target_path\`, \`equivalent_content\`, \`reviewer\`, optional \`approved_at\`, \`reason\`
- Launch rule: each of all ${totalLegacyUrls} legacy URLs needs a deliberate equivalent 200 route, reviewed one-hop 301, or approved 410 before cutover. Set \`equivalent_content=true\` only after same-content human review; homepage and search targets stay blocked.

## External SEO Exports

- Missing required sources: ${missingSeoSourcesLine(seoGateEvidence)}
${seoCoverageLine(seoEvidence.summary)}
${["search_console", "yandex_webmaster", "backlinks"].map((source) => sourceLine(source, seoEvidence.summary)).join("\n")}

- Minimum required domain coverage:
${sourceDomainSampleLines(seoEvidence)}
- Admin import endpoints:
${["search_console", "yandex_webmaster", "backlinks"].map(importLine).join("\n")}
- Template endpoints: \`GET /api/admin/seo-evidence/template?source=search_console\`, \`?source=yandex_webmaster\`, \`?source=backlinks\`
- Joined evidence export endpoint: \`GET /api/admin/seo-evidence/export\`
- Status report: \`npm run seo:preflight:report\` writes current missing/invalid SEO export state without clearing the launch gate.
- Admin SEO preflight endpoint: \`GET /api/admin/seo-preflight\`.
- Production/CLI path overrides: \`MS_REALTY_SEO_EVIDENCE_INPUT_DIR\`, \`MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH\`, \`MS_REALTY_SEO_PREFLIGHT_REPORT_PATH\`, \`MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH\`, \`MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH\`
- Optional analytics: \`migration/external/seo/analytics.csv\`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both \`makler-realty.com\` and \`makler-realty.ru\`.

## Live Service Provisioning

- Current report evidence:
${liveServiceReportLines(liveServiceEvidence).join("\n")}
- Current provisioning evidence:
${liveServiceProvisioningLine(liveServiceProvisioning)}
- Search engines: set \`TYPESENSE_URL\`, \`TYPESENSE_API_KEY\`, \`MEILI_URL\`, and \`MEILI_API_KEY\`.
- Hermes Agent: set \`HERMES_CHAT_COMPLETIONS_URL\` to its internal \`/v1/chat/completions\` API and set \`HERMES_API_KEY\`; production Hermes evidence must be authenticated.
- Hermes runtime: \`npm run hermes:runtime\` verifies its \`/health\` endpoint and authenticated \`/v1/capabilities\` response before any draft-worker evidence is accepted.
- Managed local profile: set \`HERMES_AGENT_MODEL\`, \`HERMES_AGENT_LLM_BASE_URL\`, and \`HERMES_AGENT_LLM_API_KEY\`, then run \`npm run docker:hermes:up\`. The Agent only forwards to a private OpenAI-compatible model provider; its tools and persistent memory are disabled.
- Hermes provider report: \`npm run hermes:provisioning\` writes \`production/data/hermes-provider-provisioning-report.json\` without persisting API keys.
- Live service provisioning report: \`npm run live:provisioning\` writes \`production/data/live-service-provisioning-report.json\` with redacted endpoint health and missing-env evidence.
- Admin provisioning status endpoint: \`GET /api/admin/live-service-provisioning\`.
- Admin provisioning import endpoint: \`POST /api/admin/live-service-provisioning/import\` accepts the redacted JSON from \`npm run live:provisioning\`.
- Provisioning preflight: \`npm run live:provisioning:preflight\` must pass before live evidence capture.
- Live evidence capture: \`npm run live:capture\` runs search sync, search query, Hermes draft worker, and validates the three report outputs.
- Individual debug commands: \`npm run search:sync\`, \`npm run search:query\`, \`npm run hermes:worker\`.
- Status report: \`npm run live:report\` writes current missing/invalid live-service report state without clearing the launch gate.
- Admin live-services status endpoint: \`GET /api/admin/live-services\`.
- Report preflight: \`npm run live:preflight\`.
- Report examples: \`production/data/search-engine-sync-report.json.example\`, \`production/data/search-engine-query-report.json.example\`, \`production/data/hermes-draft-worker-report.json.example\`.
- Admin template endpoint: \`GET /api/admin/live-service-report-template?source=typesense_meilisearch_sync\`, \`?source=typesense_meilisearch_query\`, \`?source=hermes_draft_worker\`.
- Admin import endpoint: \`POST /api/admin/live-service-reports/import?source=typesense_meilisearch_sync\`, \`?source=typesense_meilisearch_query\`, \`?source=hermes_draft_worker\`.
- Production/CLI report path overrides: \`MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH\`, \`MS_REALTY_SEARCH_SYNC_REPORT_PATH\`, \`MS_REALTY_SEARCH_QUERY_REPORT_PATH\`, \`MS_REALTY_HERMES_WORKER_REPORT_PATH\`, \`MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH\`.
- Hermes ledger path overrides: \`MS_REALTY_TRANSLATION_LEDGER_PATH\`, \`MS_REALTY_HERMES_AUDIT_PATH\`, \`MS_REALTY_AUDIT_LOG_PATH\`.
- Real report outputs stay local and ignored; examples do not count as launch evidence.
- Launch rule: run live search and Hermes commands after provisioning; the checked-in smoke commands remain local contract tests only.

## Payload Runtime

- Current gate: ${launchReadiness.gates.find((gate) => gate.id === "payload_runtime")?.status || "unknown"}
- Runtime report: \`production/data/payload-runtime-report.json\` (real output stays local and ignored)
- Runtime report example: \`production/data/payload-runtime-report.json.example\`
- Current check evidence:
${payloadCheckLines(payloadEvidence).join("\n")}
- Runtime env example: \`production/data/payload-runtime.env.example\`
- Local Postgres compose file: \`production/docker-compose.payload.yml\`
- Collection export: \`production/data/payload-collections.json\`
- Admin route: \`/payload-admin\`; API routes: \`/api/[...slug]\`, \`/graphql\`, \`/graphql-playground\`.
- Required env: \`PAYLOAD_SECRET\`, \`DATABASE_URL\`${missingPayloadEnv.length ? `; currently missing: ${missingPayloadEnv.map((name) => `\`${name}\``).join(", ")}` : ""}.
- Secret strength: \`PAYLOAD_SECRET\` must be at least 32 bytes${weakPayloadEnv.length ? `; currently weak: ${weakPayloadEnv.map((name) => `\`${name}\``).join(", ")}` : ""}.
- Runtime evidence: \`payload\` dependency present, \`payload.config.js\` present, collection export generated, and required env configured.
- Placeholder rule: copied example values such as \`replace-with-...\` and \`change-me\` stay blocked.
- Runtime commands: \`npm run payload:bootstrap\`, copy/edit the private env file, start Postgres, then \`npm run payload:runtime\` and \`npm run payload:preflight\`.
- Admin bootstrap endpoint: \`GET /api/admin/payload-runtime-bootstrap\`.
- Admin import endpoint: \`POST /api/admin/payload-runtime/import\` accepts the redacted JSON from \`npm run payload:runtime\`.
- Admin status endpoint: \`GET /api/admin/payload-runtime\`.
- Production/CLI path overrides: \`MS_REALTY_PAYLOAD_RUNTIME_ENV_EXAMPLE_PATH\`, \`MS_REALTY_PAYLOAD_RUNTIME_COMPOSE_PATH\`, \`MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH\`.
- Real Payload runtime reports stay local and ignored; examples do not count as launch evidence.
- Launch rule: the interim admin workbenches do not count as the final Payload CMS runtime.

## Production Recovery

- Current gate: ${recoveryGate?.status || "unknown"}
- Current evidence: ${recoveryEvidence.status || "unknown"}${recoveryEvidence.path ? ` (${recoveryEvidence.path})` : ""}${recoveryEvidence.error ? ` — ${recoveryEvidence.error}` : ""}
- Private report: \`production/data/production-recovery-report.json\` (ignored)
- Report example: \`production/data/production-recovery-report.json.example\`
- Admin template endpoint: \`GET /api/admin/production-recovery-template\`
- Admin status endpoint: \`GET /api/admin/production-recovery\`
- Admin import endpoint: \`POST /api/admin/production-recovery/import\` accepts only validated, redacted production evidence.
- Path override: \`MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH\`
- Required scope: encrypted-at-rest and encrypted-in-transit off-site backups covering Payload/Postgres, CRM/CMS runtime data, and runtime evidence.
- Required drill: successful isolated restore of the cited backup with checksums, rollback procedure verification, named operator, and separate named reviewer approval.
- Launch rule: the tested local \`docker:backup\` path is not production disaster-recovery evidence.

## Content Quality Warnings

- Current review evidence:
${listingReviewEvidenceLine(listingReviewEvidence)}
- Pending review sample:
${listingPendingReviewLines(listingReviewEvidence)}
- Workbook: \`production/data/listing-quality-workbook.csv\`
- Review packet: \`production/data/listing-quality-review-packet.json\`
- Draft review CSV: \`production/data/listing-quality-review-draft.csv\`
- Scope: 165 source listing rows; warning counts below include structured-data entries and listing-quality source rows.
- Review input path: \`migration/reviews/listing-quality.csv\`
- Example input: \`migration/reviews/listing-quality.csv.example\`
- Draft and example rows intentionally leave reviewer fields blank; fill them only after human gallery/facts review.
- Production/CLI path overrides: \`MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH\`, \`MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH\`, \`MS_REALTY_LISTING_QUALITY_REVIEW_PATH\`
- Status report: \`npm run listing:preflight:report\` writes current missing/invalid listing-review state without clearing the launch gate.
- Build path overrides: \`MS_REALTY_LISTING_EDIT_LEDGER_PATH\`, \`MS_REALTY_TOUR_APPROVAL_LEDGER_PATH\`, \`MS_REALTY_LISTING_QUALITY_REPORT_PATH\`, \`MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH\`
- Preflight report override: \`MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH\`
- Review columns: \`review_status\`, \`required_editor_fields\`, \`price_eur\`, \`area_sqm\`, \`bedrooms\`, \`location\`, \`description\`, \`facts_reviewer\`, \`media_reviewer\`, \`review_notes\`
- Launch review CSVs must retain draft snapshot columns: \`editor_path\`, \`review_status\`, \`issues\`, \`required_editor_fields\`, \`public_gallery_assets\`, \`public_gallery_sample\`, \`missing_alt_text_assets\`.
- Admin review packet endpoint: \`GET /api/admin/listing-quality-review-packet\`
- Admin draft endpoint: \`GET /api/admin/listing-quality-review-draft\`
- Admin status endpoint: \`GET /api/admin/listing-quality\`
- Admin import endpoint: \`POST /api/admin/listing-quality/import\`
- Admin editor endpoint: \`POST /api/admin/listings/edit\`
- Review pack command: \`npm run listing:review-pack\`.
- Launch rule: the review CSV must include one valid row for every workbook row; partial CSVs are only for iterative admin imports.
${launchReadiness.warnings.map((warning) => `- ${warning.id}: ${warning.count}`).join("\n")}

## Broker Verification

- Report: \`production/data/listing-verification-report.json\`
- Broker verification tasks: ${listingVerification.summary.broker_verification_tasks}
- High priority tasks: ${listingVerification.summary.high_priority}
- Tasks by owner: ${verificationOwners || "none"}
- Publication/verification build overrides: \`MS_REALTY_LOCALE_REGISTRY_PATH\`, \`MS_REALTY_LISTING_EDIT_LEDGER_PATH\`, \`MS_REALTY_LISTING_PUBLICATION_REPORT_PATH\`, \`MS_REALTY_LISTING_VERIFICATION_REPORT_PATH\`

## Monitoring And Rollback

- Report: \`production/data/launch-readiness.json\`
- Admin endpoint: \`GET /api/admin/launch-readiness\`
- Monitoring sources: ${launchReadiness.monitoring_plan.map((item) => `${item.source}: ${item.status}`).join(", ")}
- Rollback steps: ${launchReadiness.rollback_plan.length}
- Current machine evidence:
${monitoringRollbackEvidenceLine(monitoringEvidence)}
- Private report: \`production/data/monitoring-rollback-report.json\` (ignored); template: \`production/data/monitoring-rollback-report.json.example\`.
- Path override: \`MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH\`; validate it with \`npm run monitoring:preflight\`.
- Required machine proof: a redacted production report less than 24 hours old, a passing public HTTPS endpoint and alert, an automated rollback policy, a passing canary, and a verified isolated rollback drill.
- Release attestation: after every existing gate passes, set \`MS_REALTY_RELEASE_SHA\`, the mounted evidence paths, and the private signing key; run \`npm run launch:evidence:capture\`, then \`npm run launch:evidence:verify\` on the exact release SHA.
- Launch rule: an evidence bundle records validated inputs; it does not create human listing reviews, SEO exports, broker approval, or production readiness.

## Validate After Inputs

- Admin status endpoint: \`GET /api/admin/preflight-reports\`

\`\`\`bash
npm run redirects:preflight
npm run redirects:build
npm run seo:preflight
npm run seo:evidence
npm run seo:preflight:report
npm run live:provisioning
npm run live:provisioning:preflight
npm run live:capture
npm run live:report
npm run live:preflight
npm run monitoring:preflight
npm run payload:bootstrap
npm run payload:runtime
npm run payload:preflight
npm run listing:review-pack
npm run listing:preflight
npm run launch:readiness
npm run launch:inputs
npm run launch:preflight
npm run launch:evidence:capture
npm run launch:evidence:verify
\`\`\`
`;
}

export function writeLaunchInputChecklist(markdown, outPath = DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT) {
  fs.writeFileSync(outPath, markdown);
  return outPath;
}
