import crypto from "node:crypto";
import fs from "node:fs";
import { buildLaunchFreeze } from "../lib/launch-freeze.mjs";
import { fromRoot } from "../lib/paths.mjs";

const files = Object.freeze({
  migration_records: fromRoot("production", "data", "migration-records.json"),
  route_map: fromRoot("production", "data", "legacy-route-map.json"),
  route_decisions: fromRoot("production", "data", "deployable-redirects.json"),
  manual_listing_audit: fromRoot("production", "data", "manual-listing-audit.json"),
  content_parity: fromRoot(
    "migration",
    "content-evidence",
    "20260729-legacy-content-review",
    "content-parity-report.json",
  ),
  app_route_manifest: fromRoot("production", "data", "app-route-manifest.json"),
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const data = Object.fromEntries(Object.entries(files).map(([name, filePath]) => [name, readJson(filePath)]));
const inputs = Object.fromEntries(
  Object.entries(files).map(([name, filePath]) => [name, { path: filePath.replace(`${fromRoot()}/`, ""), sha256: sha256(filePath) }]),
);
const freeze = buildLaunchFreeze({
  migrationRecords: data.migration_records.records,
  routeMap: data.route_map.routes,
  legacyDecisions: data.route_decisions.decisions,
  manualAudit: data.manual_listing_audit,
  contentParity: data.content_parity,
  appRouteManifest: data.app_route_manifest,
  inputs,
});
const output = fromRoot("production", "data", "launch-freeze.json");
fs.writeFileSync(output, `${JSON.stringify(freeze, null, 2)}\n`);
console.log(JSON.stringify(freeze.summary));

