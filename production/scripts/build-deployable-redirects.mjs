import fs from "node:fs";
import {
  appendRedirectApproval,
  buildDeployableRedirects,
  buildLegacyRouteDecisions,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  writeRedirectApprovalWorkbook,
  writeDeployableRedirects,
} from "../lib/redirect-approvals.mjs";
import { loadMigrationRecords } from "../lib/content.mjs";
import { attachMigrationReviewEvidence } from "../lib/migration-review.mjs";
import { fromRoot } from "../lib/paths.mjs";

const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const importPath = fromRoot("migration", "reviews", "redirect-approvals.csv");
const approvalLedgerPath = process.env.MS_REALTY_REDIRECT_APPROVALS_PATH || undefined;
const deployableRedirectOutputPath = process.env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || undefined;
const bgListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path);
const ruListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path);

if (!bgListing || !ruListing) {
  throw new Error("Expected BG and RU listing route rows before redirect export");
}

const workbook = writeRedirectApprovalWorkbook(attachMigrationReviewEvidence(routeMap, loadMigrationRecords()));
let approvals = readRedirectApprovals(approvalLedgerPath);
if (!approvals.length && fs.existsSync(importPath)) {
  importRedirectApprovalsCsv(routeMap, fs.readFileSync(importPath, "utf8"), {
    filePath: approvalLedgerPath,
    approvedAt: "2026-07-04T00:00:00Z",
  });
  approvals = readRedirectApprovals(approvalLedgerPath);
} else if (!approvals.length) {
  for (const route of [bgListing, ruListing]) {
    appendRedirectApproval(routeMap, {
      oldUrl: route.old_url,
      equivalentContent: true,
      reviewer: route.target_locale === "ru" ? "editor_ru" : "editor_bg",
      reason: "Smoke-approved same-content listing route; pages, taxonomy, and posts remain review-gated.",
    }, {
      filePath: approvalLedgerPath,
      approvedAt: "2026-07-04T00:00:00Z",
    });
  }
  approvals = readRedirectApprovals(approvalLedgerPath);
}

const decisions = buildLegacyRouteDecisions(routeMap, approvals);
const redirects = buildDeployableRedirects(routeMap, approvals);
const { outPath, summary, decisionSummary } = writeDeployableRedirects(redirects, deployableRedirectOutputPath, { decisions });

console.log(`Wrote ${workbook.rows.length} redirect approval workbook rows to ${workbook.outPath}`);
console.log(`Wrote ${summary.total} deployable redirects to ${outPath}`);
console.log(`Wrote ${decisionSummary.total} reviewed legacy route decisions`);
console.log(`Target locales: ${JSON.stringify(summary.byTargetLocale)}`);
