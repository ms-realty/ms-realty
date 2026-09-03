import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendRedirectApproval,
  assertDeployableRedirects,
  assertLegacyRouteDecisions,
  buildRedirectApprovalWorkbook,
  buildDeployableRedirects,
  buildLegacyRouteDecisions,
  buildPendingRedirectApprovalWorkbook,
  buildLegacyRouteReviewState,
  importRedirectApprovalsCsv,
  loadLegacyRouteDecisions,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  resetRedirectApprovals,
  summarizeDeployableRedirects,
  validateRedirectApprovalsCsv,
} from "../lib/redirect-approvals.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { loadMigrationRecords } from "../lib/content.mjs";
import { attachMigrationReviewEvidence } from "../lib/migration-review.mjs";
import { fromRoot } from "../lib/paths.mjs";

function loadRouteMap() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
}

function tempApprovalFile() {
  return path.join(os.tmpdir(), `ms-realty-redirect-approvals-${process.pid}-${Date.now()}.jsonl`);
}

test("route decisions require an explicit terminal choice and same-content confirmation where applicable", () => {
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
    /Route decision must be redirect_301, retain_200, or approved_410/,
  );
  assert.throws(
    () => appendRedirectApproval(routeMap, {
    oldUrl: listing.old_url,
    decision: "redirect_301",
      equivalentContent: false,
      reviewer: "editor_bg",
    }, { filePath }),
    /equivalentContent true/,
  );
});

test("redirect approval workbooks retain crawl SEO evidence for editorial review", () => {
  const routeMap = loadRouteMap();
  const records = loadMigrationRecords();
  const [route] = attachMigrationReviewEvidence(routeMap.slice(0, 1), records);
  const [row] = buildRedirectApprovalWorkbook([route]);
  const csv = renderRedirectApprovalWorkbook([row]);

  assert.equal(row.source_meta_description, records[0].source_seo.meta_description);
  assert.equal(row.source_open_graph, records[0].source_seo.open_graph);
  assert.match(csv, /source_meta_description,source_open_graph/);
});

test("human-reviewed 410 and retained decisions are terminal without inventing a redirect", () => {
  const routeMap = loadRouteMap();
  const filePath = tempApprovalFile();
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const page = routeMap.find((route) => route.url_type === "page" && route.old_url !== "https://makler-realty.com");
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg");

  resetRedirectApprovals(filePath);
  appendRedirectApproval(routeMap, {
    oldUrl: taxonomy.old_url,
    decision: "approved_410",
    reviewer: "seo_editor",
    reason: "No truthful replacement remains after editorial review.",
  }, { filePath, approvedAt: "2026-07-13T00:00:00Z" });
  appendRedirectApproval(routeMap, {
    oldUrl: page.old_url,
    decision: "retain_200",
    targetPath: listing.target_path,
    equivalentContent: true,
    reviewer: "seo_editor",
    reason: "The verified replacement content remains available under the legacy URL.",
  }, { filePath, approvedAt: "2026-07-13T00:00:00Z" });

  const approvals = readRedirectApprovals(filePath);
  const decisions = buildLegacyRouteDecisions(routeMap, approvals);

  assert.equal(assertLegacyRouteDecisions(decisions).total, 2);
  assert.equal(decisions.find((row) => row.old_url === taxonomy.old_url).status, 410);
  assert.equal(decisions.find((row) => row.old_url === page.old_url).status, 200);
  assert.equal(buildDeployableRedirects(routeMap, approvals).length, 0);
  assert.equal(buildPendingRedirectApprovalWorkbook(routeMap, approvals).length, 455);
  assert.throws(
    () => appendRedirectApproval(routeMap, {
      oldUrl: taxonomy.old_url,
      decision: "approved_410",
      targetPath: listing.target_path,
      reviewer: "seo_editor",
      reason: "A removed route cannot retain a target.",
    }, { filePath }),
    /cannot include a targetPath/,
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
    /Route decision must be redirect_301, retain_200, or approved_410/,
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

test("deployable redirect build CLI replaces stale ledger state from the reviewed CSV", () => {
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
  assert.equal(deployable.decision_summary.total, 165);
  assert.equal(deployable.redirects.length, 165);
  assert.equal(loadLegacyRouteDecisions(outputPath).length, 165);

  const routeMap = loadRouteMap();
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  appendRedirectApproval(routeMap, {
    oldUrl: taxonomy.old_url,
    decision: "approved_410",
    reviewer: "seo_editor",
    reason: "The reviewed legacy taxonomy has no truthful public replacement.",
  }, { filePath: ledgerPath, approvedAt: "2026-07-13T00:00:00Z" });
  const rerun = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-deployable-redirects.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_REDIRECT_APPROVALS_PATH: ledgerPath,
      MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: outputPath,
    },
  });

  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(readRedirectApprovals(ledgerPath).length, 165);
  const rebuilt = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(rebuilt.redirects.length, 165);
  assert.equal(rebuilt.decisions.length, 165);
  assert.equal(rebuilt.decisions.some((row) => row.old_url === taxonomy.old_url), false);
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

test("redirect approval workbook includes every legacy URL without approving it", () => {
  const rows = buildRedirectApprovalWorkbook(attachMigrationReviewEvidence(loadRouteMap(), loadMigrationRecords()));
  const parsed = parseCsv(renderRedirectApprovalWorkbook(rows));
  const evidenceRow = parsed.find((row) => row.source_title && row.source_canonical);

  assert.equal(rows.length, 457);
  assert.equal(parsed.length, 457);
  assert.equal(evidenceRow.source_status, "200");
  assert.match(evidenceRow.source_final_url, /^https:\/\/makler-realty\.(?:com|ru)/);
  assert.ok(evidenceRow.source_h1);
  assert.ok(evidenceRow.source_robots_meta);
  assert.ok(evidenceRow.source_word_count);
  assert.equal(evidenceRow.review_owner, "unassigned");
  assert.ok(evidenceRow.action_required);
  assert.ok(evidenceRow.priority);
  assert.match(evidenceRow.metadata_gaps, /missingSchema/);
  assert.equal(parsed.every((row) => row.equivalent_content === "false"), true);
  assert.equal(parsed.filter((row) => row.url_type === "listing").every((row) => /^MS-/.test(row.target_listing_id)), true);
  assert.equal(parsed.filter((row) => row.url_type === "listing").every((row) => row.review_status === "pending_same_content_review"), true);
  assert.equal(parsed.filter((row) => row.url_type !== "listing").every((row) => row.review_status === "pending_terminal_route_review"), true);
  assert.match(parsed.find((row) => row.url_type === "listing").same_content_checklist, /same property/);
  assert.equal(parsed.every((row) => row.old_url && row.reviewer === ""), true);
  assert.equal(parsed.filter((row) => row.url_type !== "listing").every((row) => row.decision === "" && row.target_path === ""), true);
});

test("completed workbook rows import while untouched evidence rows remain pending", () => {
  const routeMap = loadRouteMap();
  const rows = buildRedirectApprovalWorkbook(attachMigrationReviewEvidence(routeMap, loadMigrationRecords()));
  const listing = rows.find((row) => row.url_type === "listing" && row.target_locale === "bg");
  listing.equivalent_content = true;
  listing.reviewer = "editor_bg";
  listing.approved_at = "2026-07-04T00:00:00Z";
  listing.reason = "Human-reviewed same property.";

  const result = validateRedirectApprovalsCsv(routeMap, renderRedirectApprovalWorkbook(rows));

  assert.equal(result.approvals.length, 1);
  assert.equal(result.approvals[0].old_url, listing.old_url);
  assert.equal(result.approvals[0].reviewer, "editor_bg");
  assert.equal(result.decisionSummary.total, 1);
  assert.equal(result.summary.total, 1);
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

// The review screen owes the operator the truth about what is undecided, and
// two things decide a URL: the workspace ledger and the sealed launch contract.
test("a legacy URL is pending only when neither the workspace nor the sealed contract decides it", () => {
  const routes = loadRouteMap();
  const contract = [
    { old_url: routes[0].old_url, approval_state: "approved", deployable: true, approval_id: "MSR-LAUNCH-FREEZE-1" },
    { old_url: routes[1].old_url, approval_state: "approved", deployable: true, approval_id: "MSR-LAUNCH-FREEZE-1" },
    // Proposed but never approved: decides nothing.
    { old_url: routes[2].old_url, approval_state: "required", deployable: false },
  ];
  const workspace = [
    {
      old_url: routes[1].old_url,
      decision: "approved_410",
      equivalent_content: false,
      reviewer: "seo_taxonomy_editor",
      reason: "Reviewed and retired in the workspace.",
      approved_at: "2026-09-01T09:00:00Z",
      deployable: true,
    },
  ];
  const state = buildLegacyRouteReviewState(routes, workspace, contract);

  assert.equal(state.sourceReviewRequired.length, routes.filter((route) => route.review_required).length);
  // routes[0]: contract only. routes[1]: workspace overrides the contract.
  // routes[2]: proposed, so still pending. Everything else: pending.
  assert.deepEqual(state.contractOnly.map((route) => route.old_url), [routes[0].old_url]);
  assert.equal(state.workspaceDecidedUrls.has(routes[1].old_url), true);
  assert.equal(state.contractDecidedUrls.has(routes[2].old_url), false);
  assert.equal(state.pending.some((route) => route.old_url === routes[2].old_url), true);
  assert.equal(state.pending.length, state.sourceReviewRequired.length - 2);
  assert.deepEqual(state.contractApprovalIds, ["MSR-LAUNCH-FREEZE-1"]);

  // The same rows without the contract read as if nothing had been sealed --
  // which is exactly the defect the screen had.
  const blind = buildLegacyRouteReviewState(routes, workspace, []);
  assert.equal(blind.pending.length, state.sourceReviewRequired.length - 1);
  assert.deepEqual(blind.contractOnly, []);
});

test("crawl evidence attaches to sealed-contract rows, not only to pending ones", () => {
  // The smoke used to prove evidence attachment on the first pending row.
  // Nothing is pending any more, and evidence is not a property of pendingness.
  const routes = loadRouteMap();
  const contract = routes.map((route) => ({ old_url: route.old_url, approval_state: "approved", deployable: true, approval_id: "MSR-LAUNCH-FREEZE-1" }));
  const state = buildLegacyRouteReviewState(routes, [], contract);
  const withEvidence = attachMigrationReviewEvidence(state.contractOnly, loadMigrationRecords());
  const home = withEvidence.find((row) => row.old_url === "https://makler-realty.com");
  assert.equal(home.source_evidence.title, "Недвижими имоти в Сандански | MS Realty");
});
