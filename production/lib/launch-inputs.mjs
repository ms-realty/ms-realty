import fs from "node:fs";
import { parseCsv } from "./csv.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT = fromRoot("production", "data", "launch-input-checklist.md");

function rowCount(csvText) {
  return parseCsv(csvText).length;
}

function sourceLine(source, summary) {
  const state = summary.sources[source];
  const filename = {
    search_console: "search-console.csv",
    yandex_webmaster: "yandex-webmaster.csv",
    backlinks: "backlinks.csv",
  }[source];
  const domains = (state.matched_source_domains || []).join(", ") || "none";
  return `- \`migration/external/seo/${filename}\`: ${state.status}, ${state.matched_rows} matched rows, domains: ${domains}`;
}

export function renderLaunchInputChecklist({
  generatedAt,
  launchReadiness,
  seoEvidence,
  redirectWorkbookCsv,
  deployableRedirects,
  routeMap,
}) {
  const mapped = routeMap.summary.mappedListings;
  const approved = deployableRedirects.summary.total;
  const remaining = Math.max(mapped - approved, 0);
  const workbookRows = rowCount(redirectWorkbookCsv);

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
- Required columns: \`old_url,target_path,target_locale,source_domain,equivalent_content,reviewer,approved_at,reason\`
- Launch rule: set \`equivalent_content=true\` only after same-content human review. Homepage targets stay blocked.

## External SEO Exports

${["search_console", "yandex_webmaster", "backlinks"].map((source) => sourceLine(source, seoEvidence.summary)).join("\n")}

- Optional analytics: \`migration/external/seo/analytics.csv\`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both \`makler-realty.com\` and \`makler-realty.ru\`.

## Validate After Inputs

\`\`\`bash
npm run redirects:build
npm run seo:evidence
npm run launch:readiness
\`\`\`
`;
}

export function writeLaunchInputChecklist(markdown, outPath = DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT) {
  fs.writeFileSync(outPath, markdown);
  return outPath;
}
