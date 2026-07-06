import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendRedirectApproval,
  assertDeployableRedirects,
  buildRedirectApprovalWorkbook,
  buildDeployableRedirects,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  resetRedirectApprovals,
  summarizeDeployableRedirects,
  validateRedirectApprovalsCsv,
} from "../lib/redirect-approvals.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { fromRoot } from "../lib/paths.mjs";

function loadRouteMap() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
}

function tempApprovalFile() {
  return path.join(os.tmpdir(), `ms-realty-redirect-approvals-${process.pid}-${Date.now()}.jsonl`);
}

test("redirect approvals reject unmapped rows and missing same-content confirmation", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");

  resetRedirectApprovals(filePath);
  assert.throws(
    () => appendRedirectApproval(routeMap, {
      oldUrl: taxonomy.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
    }, { filePath }),
    /Only mapped 301 routes/,
  );
  assert.throws(
    () => appendRedirectApproval(routeMap, {
      oldUrl: listing.old_url,
      equivalentContent: false,
      reviewer: "editor_bg",
    }, { filePath }),
    /equivalentContent true/,
  );
});

test("approved BG and RU listing routes export as deployable 301 redirects", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const bgListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");
  const ruListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru");

  resetRedirectApprovals(filePath);
  appendRedirectApproval(routeMap, {
    oldUrl: bgListing.old_url,
    equivalentContent: true,
    reviewer: "editor_bg",
  }, { filePath, approvedAt: "2026-07-04T00:00:00Z" });
  appendRedirectApproval(routeMap, {
    oldUrl: ruListing.old_url,
    equivalentContent: true,
    reviewer: "editor_ru",
  }, { filePath, approvedAt: "2026-07-04T00:00:00Z" });

  const rows = buildDeployableRedirects(routeMap, readRedirectApprovals(filePath));
  const summary = assertDeployableRedirects(rows);

  assert.equal(summary.total, 2);
  assert.equal(summary.byTargetLocale.bg, 1);
  assert.equal(summary.byTargetLocale.ru, 1);
  assert.equal(summary.homepageTargets, 0);
  assert.ok(rows.every((row) => row.status === 301));
});

test("CSV redirect approval import validates rows before appending", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");

  resetRedirectApprovals(filePath);
  assert.throws(
    () =>
      importRedirectApprovalsCsv(
        routeMap,
        `old_url,equivalent_content,reviewer,approved_at,reason\n${listing.old_url},true,editor_bg,2026-07-04T00:00:00Z,Reviewed\n${taxonomy.old_url},true,editor_bg,2026-07-04T00:00:00Z,Bad\n`,
        { filePath },
      ),
    /Only mapped 301 routes/,
  );
  assert.deepEqual(readRedirectApprovals(filePath), []);

  const approvals = importRedirectApprovalsCsv(
    routeMap,
    `old_url,equivalent_content,reviewer,approved_at,reason\n${listing.old_url},true,editor_bg,2026-07-04T00:00:00Z,Reviewed same content\n`,
    { filePath },
  );
  assert.equal(approvals.length, 1);
  assert.equal(readRedirectApprovals(filePath).length, 1);
});

test("redirect approval preflight validates CSV without appending approvals", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru");
  const csv = `old_url,equivalent_content,reviewer,approved_at,reason\n${listing.old_url},true,editor_ru,2026-07-04T00:00:00Z,Reviewed same content\n`;

  resetRedirectApprovals(filePath);
  const result = validateRedirectApprovalsCsv(routeMap, csv, { approvedAt: "2026-07-04T00:00:00Z" });

  assert.equal(result.approvals.length, 1);
  assert.equal(result.summary.total, 1);
  assert.deepEqual(readRedirectApprovals(filePath), []);
});

test("redirect approval preflight CLI fails missing CSV and passes valid CSV", () => {
  const routeMap = loadRouteMap();
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");
  const csvPath = path.join(os.tmpdir(), `ms-realty-redirect-preflight-${process.pid}-${Date.now()}.csv`);
  fs.writeFileSync(
    csvPath,
    `old_url,equivalent_content,reviewer,approved_at,reason\n${listing.old_url},true,editor_bg,2026-07-04T00:00:00Z,Reviewed same content\n`,
  );

  const missing = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-redirect-approvals.mjs"), `${csvPath}.missing`], {
    cwd: fromRoot(),
    encoding: "utf8",
  });
  const valid = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-redirect-approvals.mjs"), csvPath], {
    cwd: fromRoot(),
    encoding: "utf8",
  });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /REDIRECT APPROVAL PREFLIGHT FAILED/);
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /Redirect approval CSV valid: 1 rows/);
});

test("deployable redirect build CLI honors configured ledger and output paths", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-redirect-build-`);
  const ledgerPath = `${dir}/redirect-approvals.jsonl`;
  const outputPath = `${dir}/deployable-redirects.json`;
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-deployable-redirects.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_REDIRECT_APPROVALS_PATH: ledgerPath,
      MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readRedirectApprovals(ledgerPath).length, 165);
  const deployable = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(deployable.summary.total, 165);
  assert.equal(deployable.redirects.length, 165);
});

test("duplicate approval imports keep one deployable redirect per old URL", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");
  const csv = `old_url,equivalent_content,reviewer,approved_at,reason\n${listing.old_url},true,editor_bg,2026-07-04T00:00:00Z,Reviewed\n`;

  resetRedirectApprovals(filePath);
  importRedirectApprovalsCsv(routeMap, csv, { filePath });
  importRedirectApprovalsCsv(routeMap, csv, { filePath });

  const rows = buildDeployableRedirects(routeMap, readRedirectApprovals(filePath));
  const summary = assertDeployableRedirects(rows);

  assert.equal(readRedirectApprovals(filePath).length, 2);
  assert.equal(rows.length, 1);
  assert.equal(summary.duplicateOldUrls, 0);
});

test("redirect approval workbook includes all mapped listings without approving them", () => {
  const rows = buildRedirectApprovalWorkbook(loadRouteMap());
  const parsed = parseCsv(renderRedirectApprovalWorkbook(rows));

  assert.equal(rows.length, 165);
  assert.equal(parsed.length, 165);
  assert.equal(parsed.every((row) => row.equivalent_content === "false"), true);
  assert.equal(parsed.every((row) => /^MS-/.test(row.target_listing_id)), true);
  assert.equal(parsed.every((row) => row.review_status === "pending_same_content_review"), true);
  assert.match(parsed[0].same_content_checklist, /same property/);
  assert.equal(parsed.every((row) => row.old_url && row.target_path && row.reviewer === ""), true);
});

test("generated deployable redirect file is valid when present", () => {
  const file = fromRoot("production", "data", "deployable-redirects.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = summarizeDeployableRedirects(data.redirects);

  assert.equal(data.summary.total, 165);
  assert.equal(summary.byTargetLocale.bg, 113);
  assert.equal(summary.byTargetLocale.ru, 52);
  assert.equal(summary.homepageTargets, 0);
  assert.equal(summary.duplicateOldUrls, 0);
  assert.equal(data.redirects.length, 165);
});
