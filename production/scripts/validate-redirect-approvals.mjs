import fs from "node:fs";
import { validateRedirectApprovalsCsv } from "../lib/redirect-approvals.mjs";
import { fromRoot } from "../lib/paths.mjs";

const inputPath = process.argv[2] || fromRoot("migration", "reviews", "redirect-approvals.csv");
const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;

try {
  if (!fs.existsSync(inputPath)) throw new Error(`Missing redirect approval CSV: ${inputPath}`);
  const result = validateRedirectApprovalsCsv(routeMap, fs.readFileSync(inputPath, "utf8"), {
    approvedAt: "2026-07-04T00:00:00Z",
  });
  if (!result.approvals.length) throw new Error("Redirect approval CSV has no approval rows");

  console.log(`Redirect approval CSV valid: ${result.approvals.length} rows`);
  console.log(`Deployable dry-run redirects: ${result.summary.total}`);
  console.log(`Target locales: ${JSON.stringify(result.summary.byTargetLocale)}`);
} catch (error) {
  console.error(`REDIRECT APPROVAL PREFLIGHT FAILED: ${error.message}`);
  process.exitCode = 1;
}
