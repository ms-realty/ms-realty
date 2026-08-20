import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, resolveRuntimePath } from "./runtime.mjs";
import {
  APPROVED_LAUNCH_FREEZE_SHA256,
  loadApprovedLaunchFreeze,
} from "./launch-freeze.mjs";

export const DEFAULT_REDIRECT_APPROVALS_PATH = fromRoot("production", "data", "redirect-approvals.jsonl");
export const DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT = fromRoot("production", "data", "deployable-redirects.json");
export const DEFAULT_REDIRECT_APPROVAL_WORKBOOK_OUTPUT = fromRoot("production", "data", "redirect-approval-workbook.csv");

const TERMINAL_DECISIONS = new Map([
  ["redirect_301", 301],
  ["retain_200", 200],
  ["approved_410", 410],
]);

let runtimeTargetContext;

function routeByOldUrl(routeMap, oldUrl) {
  return routeMap.find((route) => route.old_url === oldUrl);
}

function isHomepagePath(targetPath) {
  return targetPath === "/" || /^\/[a-z]{2}(?:-[A-Z]{2})?\/?$/.test(targetPath || "");
}

function truthy(value) {
  return value === true || ["true", "1", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizedDecision(value) {
  const decision = String(value || "").trim().toLowerCase();
  if (!decision) return "";
  if (!TERMINAL_DECISIONS.has(decision)) {
    throw new Error("Route decision must be redirect_301, retain_200, or approved_410");
  }
  return decision;
}

function inferredDecision(route, input) {
  if (input.decision || input.routeDecision || input.route_decision) {
    return normalizedDecision(input.decision || input.routeDecision || input.route_decision);
  }
  if (route?.target_path && route.planned_status === 301) return "redirect_301";
  return "";
}

function normalizeTargetPath(value) {
  const targetPath = String(value || "").trim();
  if (!targetPath) throw new Error("Route decision requires an explicit targetPath");
  if (
    !targetPath.startsWith("/") ||
    targetPath.startsWith("//") ||
    targetPath.includes("?") ||
    targetPath.includes("#") ||
    targetPath.includes("\\") ||
    /\s/.test(targetPath)
  ) {
    throw new Error("Route decision targetPath must be an internal path without query, hash, or whitespace");
  }
  const normalized = targetPath.length > 1 ? targetPath.replace(/\/+$/, "") : targetPath;
  if (isHomepagePath(normalized)) {
    throw new Error("Homepage redirect targets cannot be approved");
  }
  return normalized;
}

function currentRuntimeTargetContext() {
  if (!runtimeTargetContext) {
    runtimeTargetContext = {
      registry: loadLocaleRegistry(),
      seed: loadCmsSeed(),
    };
  }
  return runtimeTargetContext;
}

function verifiedPublicTarget(targetPath) {
  const { registry, seed } = currentRuntimeTargetContext();
  const resolved = resolveRuntimePath(registry, seed, targetPath);
  if (!resolved || ["not_found", "home", "language_fallback"].includes(resolved.type)) {
    throw new Error("Route decision targetPath must resolve to published, non-home public content");
  }
  return resolved;
}

function requiredReviewer(input) {
  const reviewer = String(input.reviewer || "").trim();
  if (!reviewer) throw new Error("Route decision requires a reviewer");
  return reviewer;
}

function decisionReason(input, decision) {
  const reason = String(input.reason || "").trim();
  if (reason) return reason;
  if (decision === "redirect_301") return "Reviewed same-content route mapping.";
  throw new Error("Retained and 410 route decisions require an explicit reason");
}

function isApprovedAt(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function normalizeApproval(route, input, approvedAt) {
  if (!route) throw new Error("Route decision requires a known oldUrl");
  const decision = inferredDecision(route, input);
  if (!decision) throw new Error("Route decision must be redirect_301, retain_200, or approved_410");
  const reviewer = requiredReviewer(input);
  const reason = decisionReason(input, decision);
  const status = TERMINAL_DECISIONS.get(decision);

  if (decision === "approved_410") {
    if (input.targetPath || input.target_path) {
      throw new Error("Approved 410 route decisions cannot include a targetPath");
    }
    if (input.equivalentContent === true) {
      throw new Error("Approved 410 route decisions require equivalentContent false");
    }
    return {
      old_url: route.old_url,
      source_domain: route.source_domain,
      url_type: route.url_type,
      target_locale: null,
      target_path: null,
      decision,
      planned_status: status,
      status,
      reviewer,
      approved_at: approvedAt,
      equivalent_content: false,
      deployable: true,
      reason,
    };
  }

  if (input.equivalentContent !== true) {
    throw new Error("Redirect and retained route decisions require equivalentContent true");
  }
  const targetPath = normalizeTargetPath(input.targetPath || input.target_path || route.target_path);
  const resolved = verifiedPublicTarget(targetPath);
  const targetLocale = route.target_locale || resolved.localeCode || null;

  return {
    old_url: route.old_url,
    source_domain: route.source_domain,
    url_type: route.url_type,
    target_locale: targetLocale,
    target_path: targetPath,
    decision,
    planned_status: status,
    status,
    reviewer,
    approved_at: approvedAt,
    equivalent_content: true,
    deployable: true,
    reason,
  };
}

function approvalInputFromRow(row) {
  return {
    oldUrl: row.old_url || row.oldUrl || row.url,
    decision: row.decision || row.route_decision || row.routeDecision,
    targetPath: row.target_path || row.targetPath,
    equivalentContent: truthy(row.equivalent_content || row.equivalentContent),
    reviewer: row.reviewer,
    reason: row.reason,
  };
}

function approvalsFromCsv(routeMap, csvText, approvedAt) {
  return parseCsv(csvText).flatMap((row) => {
    const input = approvalInputFromRow(row);
    const route = routeByOldUrl(routeMap, input.oldUrl);
    if (isUntouchedWorkbookRow(route, row)) return [];
    return [normalizeApproval(route, input, row.approved_at || approvedAt)];
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function decisionFromApproval(route, approval) {
  if (approval?.deployable !== true) return null;
  try {
    return normalizeApproval(
      route,
      {
        oldUrl: approval.old_url,
        decision: approval.decision,
        targetPath: approval.target_path,
        equivalentContent: approval.equivalent_content === true,
        reviewer: approval.reviewer,
        reason: approval.reason,
      },
      approval.approved_at,
    );
  } catch {
    return null;
  }
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
  { filePath = DEFAULT_REDIRECT_APPROVALS_PATH, approvedAt = new Date().toISOString(), replace = false } = {},
) {
  const approvals = approvalsFromCsv(routeMap, csvText, approvedAt);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const contents = approvals.length ? `${approvals.map((approval) => JSON.stringify(approval)).join("\n")}\n` : "";
  if (replace) fs.writeFileSync(filePath, contents);
  else if (contents) fs.appendFileSync(filePath, contents);
  return approvals;
}

export function validateRedirectApprovalsCsv(routeMap, csvText, { approvedAt = new Date().toISOString() } = {}) {
  const approvals = approvalsFromCsv(routeMap, csvText, approvedAt);
  const decisions = buildLegacyRouteDecisions(routeMap, approvals);
  return {
    approvals,
    summary: summarizeDeployableRedirects(buildDeployableRedirects(routeMap, approvals)),
    decisionSummary: summarizeLegacyRouteDecisions(decisions),
  };
}

function redirectApprovalWorkbookRow(route) {
  const mappedListing = route.url_type === "listing" && route.target_path && route.planned_status === 301;
  const evidence = route.source_evidence || {};
  return {
    old_url: route.old_url,
    url_type: route.url_type,
    source_domain: route.source_domain,
    source_status: evidence.status || "",
    source_final_url: evidence.final_url || "",
    source_title: evidence.title || "",
    source_h1: evidence.h1 || "",
    source_canonical: evidence.canonical || "",
    source_robots_meta: evidence.robots_meta || "",
    source_hreflang: evidence.hreflang || "",
    source_meta_description: evidence.meta_description || "",
    source_open_graph: evidence.open_graph || "",
    source_word_count: evidence.word_count ?? "",
    source_image_count: evidence.image_count ?? "",
    source_internal_link_count: evidence.internal_link_count ?? "",
    migration_action: evidence.migration_action || "",
    review_owner: evidence.review_owner || "",
    action_required: evidence.action_required || "",
    priority: evidence.priority || "",
    metadata_gaps: Array.isArray(evidence.metadata_gaps) ? evidence.metadata_gaps.join(" | ") : "",
    target_path: route.target_path || "",
    target_listing_id: mappedListing ? route.target_path.split("/").filter(Boolean).at(-1) : "",
    target_locale: route.target_locale || "",
    decision: mappedListing ? "redirect_301" : "",
    review_status: mappedListing ? "pending_same_content_review" : "pending_terminal_route_review",
    same_content_checklist: mappedListing
      ? "Confirm old URL and target listing describe the same property; no homepage or search fallback."
      : "Choose redirect_301, retain_200, or approved_410. Redirect and retained targets must be published, equivalent public content; no homepage or search fallback.",
    equivalent_content: false,
    reviewer: "",
    approved_at: "",
    reason: mappedListing
      ? "Review same-content listing route before setting equivalent_content true."
      : "Record the human-reviewed terminal route decision and reason.",
  };
}

function isUntouchedWorkbookRow(route, row) {
  if (!route) return false;
  const template = redirectApprovalWorkbookRow(route);
  return (
    !String(row.reviewer || "").trim() &&
    !String(row.approved_at || "").trim() &&
    !truthy(row.equivalent_content || row.equivalentContent) &&
    String(row.decision || "").trim().toLowerCase() === template.decision &&
    String(row.target_path || "").trim() === template.target_path &&
    (!String(row.reason || "").trim() || String(row.reason).trim() === template.reason)
  );
}

export function buildRedirectApprovalWorkbook(routeMap) {
  return routeMap.map(redirectApprovalWorkbookRow);
}

export function renderRedirectApprovalWorkbook(rows) {
  const headers = [
    "old_url",
    "url_type",
    "source_domain",
    "source_status",
    "source_final_url",
    "source_title",
    "source_h1",
    "source_canonical",
    "source_robots_meta",
    "source_hreflang",
    "source_meta_description",
    "source_open_graph",
    "source_word_count",
    "source_image_count",
    "source_internal_link_count",
    "migration_action",
    "review_owner",
    "action_required",
    "priority",
    "metadata_gaps",
    "target_path",
    "target_listing_id",
    "target_locale",
    "decision",
    "review_status",
    "same_content_checklist",
    "equivalent_content",
    "reviewer",
    "approved_at",
    "reason",
  ];
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

export function loadLegacyRouteDecisions(filePath = DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT) {
  if (!fs.existsSync(filePath)) return [];
  const artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return artifact.decisions || artifact.redirects || [];
}

export function buildLegacyRouteDecisions(routeMap, approvals) {
  const routes = new Map(routeMap.map((route) => [route.old_url, route]));
  const latest = new Map();
  for (const approval of approvals) latest.set(approval.old_url, approval);
  return [...latest.values()]
    .map((approval) => decisionFromApproval(routes.get(approval.old_url), approval))
    .filter(Boolean);
}

export function validateLegacyRouteDecisionArtifact(routeMap, rows, { requireExplicitDecision = true } = {}) {
  const routes = new Map(routeMap.map((route) => [route.old_url, route]));
  const decisions = [];
  const errors = [];
  const seen = new Set();

  for (const row of rows) {
    const oldUrl = row?.old_url;
    const route = routes.get(oldUrl);
    const label = oldUrl || "unknown legacy URL";
    if (!route) {
      errors.push({ old_url: oldUrl || null, message: `${label} is not present in the legacy route map` });
      continue;
    }
    if (seen.has(oldUrl)) {
      errors.push({ old_url: oldUrl, message: `${label} has duplicate terminal decisions` });
      continue;
    }
    seen.add(oldUrl);

    let decision = "";
    try {
      decision = normalizedDecision(row.decision);
    } catch (error) {
      errors.push({ old_url: oldUrl, message: error.message });
      continue;
    }
    if (!decision && !requireExplicitDecision && row.status === 301) decision = "redirect_301";
    if (!decision) {
      errors.push({ old_url: oldUrl, message: `${label} needs an explicit terminal decision` });
      continue;
    }
    if (!isApprovedAt(row.approved_at)) {
      errors.push({ old_url: oldUrl, message: `${label} needs a valid approval timestamp` });
      continue;
    }
    if (row.deployable !== true) {
      errors.push({ old_url: oldUrl, message: `${label} is not marked as a reviewed deployable decision` });
      continue;
    }
    if (row.source_domain !== route.source_domain || row.url_type !== route.url_type) {
      errors.push({ old_url: oldUrl, message: `${label} does not match its legacy route metadata` });
      continue;
    }
    const expectedStatus = TERMINAL_DECISIONS.get(decision);
    if (row.status !== expectedStatus || row.planned_status !== expectedStatus) {
      errors.push({ old_url: oldUrl, message: `${label} has inconsistent decision status` });
      continue;
    }
    if ((expectedStatus === 200 || expectedStatus === 301) && row.equivalent_content !== true) {
      errors.push({ old_url: oldUrl, message: `${label} needs an equivalent-content confirmation` });
      continue;
    }
    if (
      expectedStatus === 410 &&
      (row.equivalent_content !== false || row.target_path !== null || row.target_locale !== null)
    ) {
      errors.push({ old_url: oldUrl, message: `${label} has invalid approved-410 fields` });
      continue;
    }
    try {
      const normalized = normalizeApproval(
        route,
        {
          oldUrl,
          decision,
          targetPath: row.target_path,
          equivalentContent: row.equivalent_content,
          reviewer: row.reviewer,
          reason: row.reason,
        },
        row.approved_at,
      );
      if (
        normalized.target_path !== row.target_path ||
        normalized.target_locale !== row.target_locale ||
        normalized.status !== row.status
      ) {
        errors.push({ old_url: oldUrl, message: `${label} does not match the normalized terminal decision` });
        continue;
      }
      decisions.push(normalized);
    } catch (error) {
      errors.push({ old_url: oldUrl, message: error.message });
    }
  }

  return { decisions, errors, summary: summarizeLegacyRouteDecisions(decisions) };
}

export function buildDeployableRedirects(routeMap, approvals) {
  return buildLegacyRouteDecisions(routeMap, approvals)
    .filter((decision) => decision.status === 301)
    .map((decision) => ({
      old_url: decision.old_url,
      target_path: decision.target_path,
      status: 301,
      source_domain: decision.source_domain,
      target_locale: decision.target_locale,
      url_type: decision.url_type,
      reviewer: decision.reviewer,
      approved_at: decision.approved_at,
    }));
}

export function buildPendingRedirectApprovalWorkbook(routeMap, approvals) {
  const decided = new Set(buildLegacyRouteDecisions(routeMap, approvals).map((row) => row.old_url));
  return buildRedirectApprovalWorkbook(routeMap).filter((row) => !decided.has(row.old_url));
}

export function summarizeLegacyRouteDecisions(rows) {
  const summary = {
    total: rows.length,
    byStatus: { 200: 0, 301: 0, 410: 0 },
    bySourceDomain: {},
    byUrlType: {},
    homepageTargets: 0,
    duplicateOldUrls: 0,
  };
  const seen = new Set();

  for (const row of rows) {
    summary.byStatus[row.status] = (summary.byStatus[row.status] || 0) + 1;
    summary.bySourceDomain[row.source_domain] = (summary.bySourceDomain[row.source_domain] || 0) + 1;
    summary.byUrlType[row.url_type] = (summary.byUrlType[row.url_type] || 0) + 1;
    if (row.target_path && isHomepagePath(row.target_path)) summary.homepageTargets += 1;
    if (seen.has(row.old_url)) summary.duplicateOldUrls += 1;
    seen.add(row.old_url);
  }

  return summary;
}

export function assertLegacyRouteDecisions(rows) {
  const summary = summarizeLegacyRouteDecisions(rows);
  if (summary.total < 1) throw new Error("At least one reviewed legacy route decision is required for export smoke");
  if (summary.homepageTargets !== 0) throw new Error("Legacy route decisions must not target homepages");
  if (summary.duplicateOldUrls !== 0) throw new Error("Legacy route decisions must not duplicate old URLs");
  if (
    rows.some(
      (row) =>
        ![200, 301, 410].includes(row.status) ||
        TERMINAL_DECISIONS.get(row.decision) !== row.status ||
        row.planned_status !== row.status ||
        !row.old_url ||
        !row.reviewer ||
        !isApprovedAt(row.approved_at) ||
        !row.reason ||
        row.deployable !== true ||
        ((row.status === 200 || row.status === 301) && (!row.target_path || row.equivalent_content !== true)) ||
        (row.status === 410 && (row.target_path !== null || row.target_locale !== null || row.equivalent_content !== false)),
    )
  ) {
    throw new Error("Legacy route decisions must be complete 200, 301, or 410 rows");
  }
  return summary;
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

export function approvedLaunchFreezeRouteArtifact(freeze = loadApprovedLaunchFreeze()) {
  const decisions = freeze.routes;
  const redirects = decisions
    .filter((decision) => decision.status === 301)
    .map((decision) => ({
      old_url: decision.old_url,
      target_path: decision.target_path,
      status: 301,
      source_domain: decision.source_domain,
      target_locale: decision.target_locale,
      url_type: decision.url_type,
      reviewer: decision.reviewer,
      approved_at: decision.approved_at,
    }));
  return {
    preservation_contract: {
      locked: true,
      artifact_id: freeze.artifact_id,
      approval_id: freeze.route_approval.approval_id,
      based_on_commit: freeze.route_approval.based_on_commit,
      source_sha256: APPROVED_LAUNCH_FREEZE_SHA256,
      approved_homepage_redirects: 5,
      approved_homepage_decisions: 15,
    },
    summary: summarizeDeployableRedirects(redirects),
    decision_summary: summarizeLegacyRouteDecisions(decisions),
    redirects,
    decisions,
    catalog: freeze.catalog,
  };
}

export function isApprovedLaunchFreezeRouteArtifact(artifact) {
  if (!artifact?.preservation_contract?.locked) return false;
  try {
    const expected = approvedLaunchFreezeRouteArtifact();
    return JSON.stringify(artifact) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

export function assertDeployableRedirects(rows, { allowEmpty = false } = {}) {
  const summary = summarizeDeployableRedirects(rows);
  if (!allowEmpty && summary.total < 1) throw new Error("At least one reviewed redirect is required for export smoke");
  if (summary.homepageTargets !== 0) throw new Error("Deployable redirects must not target homepages");
  if (summary.duplicateOldUrls !== 0) throw new Error("Deployable redirects must not duplicate old URLs");
  if (rows.some((row) => row.status !== 301 || !row.target_path)) {
    throw new Error("Deployable redirects must be complete 301 rows");
  }
  return summary;
}

export function writeDeployableRedirects(
  rows,
  outPath = DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
  { decisions = rows } = {},
) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertDeployableRedirects(rows, { allowEmpty: true });
  const decisionSummary = assertLegacyRouteDecisions(decisions);
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ summary, decision_summary: decisionSummary, redirects: rows, decisions }, null, 2)}\n`,
  );
  return { outPath, summary, decisionSummary };
}
