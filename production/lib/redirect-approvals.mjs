import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_REDIRECT_APPROVALS_PATH = fromRoot("production", "data", "redirect-approvals.jsonl");
export const DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT = fromRoot("production", "data", "deployable-redirects.json");
export const DEFAULT_REDIRECT_APPROVAL_WORKBOOK_OUTPUT = fromRoot("production", "data", "redirect-approval-workbook.csv");

function routeByOldUrl(routeMap, oldUrl) {
  return routeMap.find((route) => route.old_url === oldUrl);
}

function isHomepagePath(targetPath) {
  return targetPath === "/" || /^\/[a-z]{2}(?:-[A-Z]{2})?\/?$/.test(targetPath || "");
}

function normalizeApproval(route, input, approvedAt) {
  if (!route) throw new Error("Redirect approval requires a known oldUrl");
  if (!route.target_path || route.planned_status !== 301) {
    throw new Error("Only mapped 301 routes can be approved for redirect export");
  }
  if (isHomepagePath(route.target_path)) {
    throw new Error("Homepage redirect targets cannot be approved");
  }
  if (input.equivalentContent !== true) {
    throw new Error("Redirect approval requires equivalentContent true");
  }
  if (!input.reviewer) throw new Error("Redirect approval requires a reviewer");

  return {
    old_url: route.old_url,
    source_domain: route.source_domain,
    url_type: route.url_type,
    target_locale: route.target_locale,
    target_path: route.target_path,
    planned_status: 301,
    reviewer: input.reviewer,
    approved_at: approvedAt,
    equivalent_content: true,
    deployable: true,
    reason: input.reason || "Reviewed same-content route mapping.",
  };
}

function truthy(value) {
  return value === true || ["true", "1", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function approvalInputFromRow(row) {
  return {
    oldUrl: row.old_url || row.oldUrl || row.url,
    equivalentContent: truthy(row.equivalent_content || row.equivalentContent),
    reviewer: row.reviewer,
    reason: row.reason,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function resetRedirectApprovals(filePath = DEFAULT_REDIRECT_APPROVALS_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function appendRedirectApproval(
  routeMap,
  input,
  { filePath = DEFAULT_REDIRECT_APPROVALS_PATH, approvedAt = new Date().toISOString() } = {},
) {
  const approval = normalizeApproval(routeByOldUrl(routeMap, input.oldUrl), input, approvedAt);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(approval)}\n`);
  return approval;
}

export function importRedirectApprovalsCsv(
  routeMap,
  csvText,
  { filePath = DEFAULT_REDIRECT_APPROVALS_PATH, approvedAt = new Date().toISOString() } = {},
) {
  const rows = parseCsv(csvText);
  const approvals = rows.map((row) => {
    const input = approvalInputFromRow(row);
    return normalizeApproval(routeByOldUrl(routeMap, input.oldUrl), input, row.approved_at || approvedAt);
  });
  if (!approvals.length) return [];
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${approvals.map((approval) => JSON.stringify(approval)).join("\n")}\n`);
  return approvals;
}

export function buildRedirectApprovalWorkbook(routeMap) {
  return routeMap
    .filter((route) => route.url_type === "listing" && route.target_path && route.planned_status === 301)
    .map((route) => ({
      old_url: route.old_url,
      target_path: route.target_path,
      target_locale: route.target_locale,
      source_domain: route.source_domain,
      equivalent_content: false,
      reviewer: "",
      approved_at: "",
      reason: "Review same-content listing route before setting equivalent_content true.",
    }));
}

export function renderRedirectApprovalWorkbook(rows) {
  const headers = ["old_url", "target_path", "target_locale", "source_domain", "equivalent_content", "reviewer", "approved_at", "reason"];
  return `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
}

export function writeRedirectApprovalWorkbook(
  routeMap,
  outPath = DEFAULT_REDIRECT_APPROVAL_WORKBOOK_OUTPUT,
) {
  const rows = buildRedirectApprovalWorkbook(routeMap);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderRedirectApprovalWorkbook(rows));
  return { outPath, rows };
}

export function readRedirectApprovals(filePath = DEFAULT_REDIRECT_APPROVALS_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function loadDeployableRedirects(filePath = DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8")).redirects || [];
}

export function buildDeployableRedirects(routeMap, approvals) {
  const routes = new Map(routeMap.map((route) => [route.old_url, route]));
  return approvals
    .map((approval) => {
      const route = routes.get(approval.old_url);
      if (!route || route.target_path !== approval.target_path || route.planned_status !== 301) return null;
      if (approval.equivalent_content !== true || approval.deployable !== true) return null;
      return {
        old_url: approval.old_url,
        target_path: approval.target_path,
        status: 301,
        source_domain: approval.source_domain,
        target_locale: approval.target_locale,
        reviewer: approval.reviewer,
        approved_at: approval.approved_at,
      };
    })
    .filter(Boolean);
}

export function buildPendingRedirectApprovalWorkbook(routeMap, approvals) {
  const approved = new Set(buildDeployableRedirects(routeMap, approvals).map((row) => row.old_url));
  return buildRedirectApprovalWorkbook(routeMap).filter((row) => !approved.has(row.old_url));
}

export function summarizeDeployableRedirects(rows) {
  const summary = {
    total: rows.length,
    bySourceDomain: {},
    byTargetLocale: {},
    homepageTargets: 0,
    duplicateOldUrls: 0,
  };
  const seen = new Set();

  for (const row of rows) {
    summary.bySourceDomain[row.source_domain] = (summary.bySourceDomain[row.source_domain] || 0) + 1;
    summary.byTargetLocale[row.target_locale] = (summary.byTargetLocale[row.target_locale] || 0) + 1;
    if (isHomepagePath(row.target_path)) summary.homepageTargets += 1;
    if (seen.has(row.old_url)) summary.duplicateOldUrls += 1;
    seen.add(row.old_url);
  }

  return summary;
}

export function assertDeployableRedirects(rows) {
  const summary = summarizeDeployableRedirects(rows);
  if (summary.total < 1) throw new Error("At least one reviewed redirect is required for export smoke");
  if (summary.homepageTargets !== 0) throw new Error("Deployable redirects must not target homepages");
  if (summary.duplicateOldUrls !== 0) throw new Error("Deployable redirects must not duplicate old URLs");
  if (rows.some((row) => row.status !== 301 || !row.target_path)) {
    throw new Error("Deployable redirects must be complete 301 rows");
  }
  return summary;
}

export function writeDeployableRedirects(rows, outPath = DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertDeployableRedirects(rows);
  fs.writeFileSync(outPath, `${JSON.stringify({ summary, redirects: rows }, null, 2)}\n`);
  return { outPath, summary };
}
