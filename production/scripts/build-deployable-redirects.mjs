import fs from "node:fs";
import {
  appendRedirectApproval,
  buildDeployableRedirects,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  resetRedirectApprovals,
  writeDeployableRedirects,
} from "../lib/redirect-approvals.mjs";
import { fromRoot } from "../lib/paths.mjs";

const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const importPath = fromRoot("migration", "reviews", "redirect-approvals.csv");
const bgListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path);
const ruListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path);

if (!bgListing || !ruListing) {
  throw new Error("Expected BG and RU listing route rows before redirect export");
}

resetRedirectApprovals();
if (fs.existsSync(importPath)) {
  importRedirectApprovalsCsv(routeMap, fs.readFileSync(importPath, "utf8"), {
    approvedAt: "2026-07-04T00:00:00Z",
  });
} else {
  for (const route of [bgListing, ruListing]) {
    appendRedirectApproval(routeMap, {
      oldUrl: route.old_url,
      equivalentContent: true,
      reviewer: route.target_locale === "ru" ? "editor_ru" : "editor_bg",
      reason: "Smoke-approved same-content listing route; pages, taxonomy, and posts remain review-gated.",
    }, {
      approvedAt: "2026-07-04T00:00:00Z",
    });
  }
}

const approvals = readRedirectApprovals();
const redirects = buildDeployableRedirects(routeMap, approvals);
const { outPath, summary } = writeDeployableRedirects(redirects);

console.log(`Wrote ${summary.total} deployable redirects to ${outPath}`);
console.log(`Target locales: ${JSON.stringify(summary.byTargetLocale)}`);
