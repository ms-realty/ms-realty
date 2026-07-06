import fs from "node:fs";
import { parseCsv } from "./csv.mjs";
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
  return `- \`migration/external/seo/${filename}\`: ${state.status}, ${state.matched_rows} matched rows, domains: ${domains}`;
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

export function renderLaunchInputChecklist({
  generatedAt,
  launchReadiness,
  seoEvidence,
  redirectWorkbookCsv,
  deployableRedirects,
  routeMap,
  listingVerification = defaultListingVerification(),
}) {
  const mapped = routeMap.summary.mappedListings;
  const approved = deployableRedirects.summary.total;
  const remaining = Math.max(mapped - approved, 0);
  const workbookRows = rowCount(redirectWorkbookCsv);
  const verificationOwners = Object.entries(listingVerification.summary.by_owner || {})
    .map(([owner, count]) => `${owner}: ${count}`)
    .join(", ");

  return `# Launch Input Checklist

Generated: ${generatedAt}

Status: ${launchReadiness.status}
Blockers: ${launchReadiness.blockers.join(", ") || "none"}

## Redirect Reviews

- Workbook: \`production/data/redirect-approval-workbook.csv\`
- Review rows: ${workbookRows}
- Deployable approvals: ${approved}/${mapped}
- Remaining approvals required: ${remaining}
- Import path: \`migration/reviews/redirect-approvals.csv\`
- Admin import endpoint: \`POST /api/admin/redirect-approvals/import\`
- Admin workbook endpoint: \`GET /api/admin/redirect-approval-workbook?pending=1\`
- Production adapter path overrides: \`MS_REALTY_REDIRECT_APPROVALS_PATH\`, \`MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH\`
- Review helper columns: \`target_listing_id\`, \`review_status\`, \`same_content_checklist\`
- Approval import columns: \`old_url\`, \`equivalent_content\`, \`reviewer\`, optional \`approved_at\`, optional \`reason\`
- Launch rule: set \`equivalent_content=true\` only after same-content human review. Homepage targets stay blocked.

## External SEO Exports

${["search_console", "yandex_webmaster", "backlinks"].map((source) => sourceLine(source, seoEvidence.summary)).join("\n")}

- Minimum required domain coverage:
${sourceDomainSampleLines(seoEvidence)}
- Admin import endpoints:
${["search_console", "yandex_webmaster", "backlinks"].map(importLine).join("\n")}
- Template endpoints: \`GET /api/admin/seo-evidence/template?source=search_console\`, \`?source=yandex_webmaster\`, \`?source=backlinks\`
- Production adapter path overrides: \`MS_REALTY_SEO_EVIDENCE_INPUT_DIR\`, \`MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH\`, \`MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH\`
- Optional analytics: \`migration/external/seo/analytics.csv\`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both \`makler-realty.com\` and \`makler-realty.ru\`.

## Live Service Provisioning

- Search engines: set \`TYPESENSE_URL\`, \`TYPESENSE_API_KEY\`, \`MEILI_URL\`, and \`MEILI_API_KEY\`.
- Hermes worker: set \`HERMES_CHAT_COMPLETIONS_URL\`; set \`HERMES_API_KEY\` when the endpoint requires auth.
- Search sync smoke: \`npm run search:sync && npm run search:query\`.
- Hermes draft smoke: \`npm run hermes:worker\`.
- Report preflight: \`npm run live:preflight\`.
- Report examples: \`production/data/search-engine-sync-report.json.example\`, \`production/data/search-engine-query-report.json.example\`, \`production/data/hermes-draft-worker-report.json.example\`.
- Admin template endpoint: \`GET /api/admin/live-service-report-template?source=typesense_meilisearch_sync\`, \`?source=typesense_meilisearch_query\`, \`?source=hermes_draft_worker\`.
- Admin import endpoint: \`POST /api/admin/live-service-reports/import?source=typesense_meilisearch_sync\`, \`?source=typesense_meilisearch_query\`, \`?source=hermes_draft_worker\`.
- Production adapter report path overrides: \`MS_REALTY_SEARCH_SYNC_REPORT_PATH\`, \`MS_REALTY_SEARCH_QUERY_REPORT_PATH\`, \`MS_REALTY_HERMES_WORKER_REPORT_PATH\`.
- Real report outputs stay local and ignored; examples do not count as launch evidence.
- Launch rule: run live search and Hermes commands after provisioning; the checked-in smoke commands remain local contract tests only.

## Content Quality Warnings

- Workbook: \`production/data/listing-quality-workbook.csv\`
- Scope: 165 source listing rows; warning counts below include structured-data entries and listing-quality source rows.
- Review input path: \`migration/reviews/listing-quality.csv\`
- Example input: \`migration/reviews/listing-quality.csv.example\`
- Production/CLI path override: \`MS_REALTY_LISTING_QUALITY_REVIEW_PATH\`
- Review columns: \`review_status\`, \`required_editor_fields\`, \`price_eur\`, \`bedrooms\`, \`location\`, \`description\`, \`facts_reviewer\`, \`media_reviewer\`, \`review_notes\`
- Admin import endpoint: \`POST /api/admin/listing-quality/import\`
- Admin editor endpoint: \`POST /api/admin/listings/edit\`
${launchReadiness.warnings.map((warning) => `- ${warning.id}: ${warning.count}`).join("\n")}

## Broker Verification

- Report: \`production/data/listing-verification-report.json\`
- Broker verification tasks: ${listingVerification.summary.broker_verification_tasks}
- High priority tasks: ${listingVerification.summary.high_priority}
- Tasks by owner: ${verificationOwners || "none"}

## Validate After Inputs

\`\`\`bash
npm run redirects:preflight
npm run redirects:build
npm run seo:preflight
npm run seo:evidence
npm run live:preflight
npm run listing:preflight
npm run launch:readiness
npm run launch:inputs
npm run launch:preflight
\`\`\`
`;
}

export function writeLaunchInputChecklist(markdown, outPath = DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT) {
  fs.writeFileSync(outPath, markdown);
  return outPath;
}
