import crypto from "node:crypto";

const ARTIFACT_ID = "20260817-deterministic-launch-freeze";
const APPROVAL_ID = "MSR-LAUNCH-FREEZE-1";
const APPROVED_SOURCE_COMMIT = "aea10e1d7a7b6d4ba1c7183ecbd54be40db5d720";
const APPROVED_SOURCE_ARTIFACT_SHA256 = "c627594492d253a2831bb72227920e092d32d253e89ba9a16b8a87ea32743360";

const EXPECTED = Object.freeze({
  legacy_urls: 457,
  listings: 165,
  active: 30,
  archived: 135,
  approved_listing_redirects: 165,
  proposed_retain_200: 10,
  proposed_redirect_301: 14,
  proposed_410: 268,
});

const CATALOG_STATE = Object.freeze({
  pass: "active",
  review: "archived",
  hold: "archived",
  source_unavailable: "archived",
});

const PUBLIC_EQUIVALENTS = new Map(
  Object.entries({
    "url-0001": ["retain_200", "/bg", "home"],
    "url-0002": ["retain_200", "/bg", "home"],
    "url-0005": ["redirect_301", "/bg", "home_alias"],
    "url-0006": ["redirect_301", "/bg/kontakt", "contact"],
    "url-0016": ["redirect_301", "/bg/prodai", "seller_intake"],
    "url-0043": ["retain_200", "/de", "home"],
    "url-0044": ["retain_200", "/de", "home"],
    "url-0046": ["redirect_301", "/de", "home_alias"],
    "url-0047": ["redirect_301", "/de/kontakt", "contact"],
    "url-0074": ["retain_200", "/en", "home"],
    "url-0075": ["retain_200", "/en", "home"],
    "url-0077": ["redirect_301", "/en", "home_alias"],
    "url-0078": ["redirect_301", "/en/contact", "contact"],
    "url-0226": ["retain_200", "/nl", "home"],
    "url-0227": ["retain_200", "/nl", "home"],
    "url-0229": ["redirect_301", "/nl", "home_alias"],
    "url-0230": ["redirect_301", "/nl/contact", "contact"],
    "url-0272": ["redirect_301", "/bg/tarsene", "search"],
    "url-0279": ["retain_200", "/ru", "home"],
    "url-0280": ["retain_200", "/ru", "home"],
    "url-0304": ["redirect_301", "/ru", "home_alias"],
    "url-0308": ["redirect_301", "/ru/contact", "contact"],
    "url-0432": ["redirect_301", "/ru/sell", "seller_intake"],
    "url-0444": ["redirect_301", "/ru/search", "search"],
  }).map(([id, [decision, targetPath, targetKind]]) => [id, { decision, targetPath, targetKind }]),
);

function requireExact(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label} must be ${expected}, got ${actual}`);
}

function uniqueBy(rows, key, label) {
  const values = rows.map((row) => row[key]);
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new Error(`${label} must contain unique non-empty ${key} values`);
  }
  return new Map(rows.map((row) => [row[key], row]));
}

function countBy(rows, key) {
  return Object.fromEntries(
    [...rows.reduce((counts, row) => counts.set(row[key], (counts.get(row[key]) || 0) + 1), new Map())].sort(),
  );
}

function proposalFingerprint(routes) {
  const fields = [
    "old_url",
    "source_domain",
    "url_type",
    "decision",
    "status",
    "target_path",
    "target_kind",
    "equivalent_content",
  ];
  const proposals = routes
    .filter((route) => route.approval_state === "required")
    .map((route) => Object.fromEntries(fields.map((field) => [field, route[field] ?? null])))
    .sort((left, right) => left.old_url.localeCompare(right.old_url));
  return crypto.createHash("sha256").update(JSON.stringify(proposals)).digest("hex");
}

function applyRouteApproval(routes, approval) {
  if (!approval) return routes;
  if (approval.schema_version !== 1 || approval.approval_id !== APPROVAL_ID || approval.artifact_id !== ARTIFACT_ID) {
    throw new Error(`Route approval must identify ${APPROVAL_ID} for ${ARTIFACT_ID}`);
  }
  if (approval.based_on_commit !== APPROVED_SOURCE_COMMIT) {
    throw new Error("Route approval requires the exact approved source commit");
  }
  if (approval.source_artifact_sha256 !== APPROVED_SOURCE_ARTIFACT_SHA256) {
    throw new Error("Route approval requires the exact approved source artifact hash");
  }
  if (!String(approval.approved_by || "").trim() || Number.isNaN(Date.parse(approval.approved_at))) {
    throw new Error("Route approval requires an approver and valid approval timestamp");
  }

  const proposals = routes.filter((route) => route.approval_state === "required");
  requireExact("approval scope routes", approval.scope?.routes, proposals.length);
  const actualByDecision = countBy(proposals, "decision");
  const approvedByDecision = approval.scope?.by_decision || {};
  for (const decision of new Set([...Object.keys(actualByDecision), ...Object.keys(approvedByDecision)])) {
    requireExact(`approval scope ${decision}`, approvedByDecision[decision] || 0, actualByDecision[decision] || 0);
  }
  if (approval.proposal_sha256 !== proposalFingerprint(routes)) {
    throw new Error("Route approval proposal fingerprint does not match the generated launch freeze");
  }

  return routes.map((route) =>
    route.approval_state === "required"
      ? {
          ...route,
          approval_state: "approved",
          approval_id: approval.approval_id,
          reviewer: approval.approved_by,
          approved_at: approval.approved_at,
          deployable: true,
        }
      : route,
  );
}

function listingIdFromRoute(route) {
  return String(route.target_path || "").split("/").filter(Boolean).at(-1) || "";
}

function proposedRoute(record, contentEvidence, publicPaths) {
  const equivalent = PUBLIC_EQUIVALENTS.get(record.id);
  if (equivalent) {
    if (!publicPaths.has(equivalent.targetPath)) {
      throw new Error(`${record.id} target is absent from the public route manifest: ${equivalent.targetPath}`);
    }
    return {
      old_url: record.old_url,
      source_domain: record.source_domain,
      url_type: record.url_type,
      decision: equivalent.decision,
      status: equivalent.decision === "retain_200" ? 200 : 301,
      target_path: equivalent.targetPath,
      target_kind: equivalent.targetKind,
      equivalent_content: true,
      approval_state: "required",
      deployable: false,
      reason: `Public route manifest contains the same ${equivalent.targetKind} function; human equivalence approval remains required.`,
    };
  }

  return {
    old_url: record.old_url,
    source_domain: record.source_domain,
    url_type: record.url_type,
    decision: "approved_410",
    status: 410,
    target_path: null,
    target_kind: null,
    equivalent_content: false,
    approval_state: "required",
    deployable: false,
    reason:
      contentEvidence?.content_status === "unused"
        ? "No approved equivalent exists; captured legacy text remains review-only and cannot be republished automatically."
        : `No approved equivalent exists and source content evidence is ${contentEvidence?.content_status || "unavailable"}.`,
  };
}

export function buildLaunchFreeze({
  migrationRecords,
  routeMap,
  legacyDecisions,
  manualAudit,
  contentParity,
  appRouteManifest,
  routeApproval,
  inputs,
}) {
  requireExact("migration records", migrationRecords.length, EXPECTED.legacy_urls);
  requireExact("legacy route rows", routeMap.length, EXPECTED.legacy_urls);
  requireExact("manual audit listings", manualAudit.listings?.length, EXPECTED.listings);
  requireExact("content parity URLs", contentParity.urls?.length, EXPECTED.legacy_urls);

  const recordsByUrl = uniqueBy(migrationRecords, "old_url", "Migration records");
  const routesByUrl = uniqueBy(routeMap, "old_url", "Legacy route map");
  const auditById = uniqueBy(manualAudit.listings, "id", "Manual listing audit");
  const contentByUrl = uniqueBy(contentParity.urls, "url", "Content parity report");
  const decisionsByUrl = uniqueBy(legacyDecisions, "old_url", "Legacy route decisions");
  const publicPaths = new Set(
    (appRouteManifest.routes || []).filter((route) => route.public_indexable !== false || route.type === "search").map((route) => route.path),
  );

  requireExact("reviewed legacy decisions", decisionsByUrl.size, EXPECTED.approved_listing_redirects);
  if ([...recordsByUrl].some(([url]) => !routesByUrl.has(url) || !contentByUrl.has(url))) {
    throw new Error("Every migration record must have route and content evidence");
  }

  const catalog = routeMap
    .filter((route) => route.url_type === "listing")
    .map((route) => {
      const id = listingIdFromRoute(route);
      const audit = auditById.get(id);
      const decision = decisionsByUrl.get(route.old_url);
      if (!audit || audit.source_url !== route.old_url) throw new Error(`Listing audit does not match ${route.old_url}`);
      if (!decision || decision.status !== 301 || decision.target_path !== route.target_path || decision.deployable !== true) {
        throw new Error(`Listing route is not an approved one-hop redirect: ${route.old_url}`);
      }
      const catalogState = CATALOG_STATE[audit.review_status];
      if (!catalogState) throw new Error(`Unknown listing review status: ${audit.review_status}`);
      return {
        id,
        source_url: route.old_url,
        source_locale: route.target_locale,
        checked_at: audit.checked_at,
        source_review_status: audit.review_status,
        catalog_state: catalogState,
        target_path: route.target_path,
        target_terminal_status: 200,
        active_search_eligible: catalogState === "active",
        publication_state: "review_required",
        publication_approval_granted: false,
        classification_basis:
          catalogState === "active"
            ? "approved launch-freeze source displayed the offer and the manual source review passed"
            : `manual source review classified the listing as ${audit.review_status}`,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  requireExact("catalog listings", catalog.length, EXPECTED.listings);
  const catalogCounts = countBy(catalog, "catalog_state");
  requireExact("active listings", catalogCounts.active || 0, EXPECTED.active);
  requireExact("archived listings", catalogCounts.archived || 0, EXPECTED.archived);

  const catalogBySource = new Map(catalog.map((listing) => [listing.source_url, listing]));
  const draftRoutes = migrationRecords.map((record) => {
    const listing = catalogBySource.get(record.old_url);
    if (listing) {
      const decision = decisionsByUrl.get(record.old_url);
      return {
        ...decision,
        approval_state: "approved",
        target_terminal_status: 200,
        target_catalog_state: listing.catalog_state,
      };
    }
    return proposedRoute(record, contentByUrl.get(record.old_url), publicPaths);
  });

  const draftApprovalCounts = countBy(draftRoutes, "approval_state");
  const statusCounts = countBy(draftRoutes, "status");
  requireExact("draft approved routes", draftApprovalCounts.approved || 0, EXPECTED.approved_listing_redirects);
  requireExact(
    "draft routes requiring approval",
    draftApprovalCounts.required || 0,
    EXPECTED.legacy_urls - EXPECTED.approved_listing_redirects,
  );
  requireExact("terminal 200 proposals", statusCounts[200] || 0, EXPECTED.proposed_retain_200);
  requireExact(
    "terminal 301 decisions and proposals",
    statusCounts[301] || 0,
    EXPECTED.approved_listing_redirects + EXPECTED.proposed_redirect_301,
  );
  requireExact("terminal 410 proposals", statusCounts[410] || 0, EXPECTED.proposed_410);

  const routes = applyRouteApproval(draftRoutes, routeApproval);
  const approvalCounts = countBy(routes, "approval_state");
  requireExact(
    "approved routes",
    approvalCounts.approved || 0,
    routeApproval ? EXPECTED.legacy_urls : EXPECTED.approved_listing_redirects,
  );
  requireExact(
    "routes requiring approval",
    approvalCounts.required || 0,
    routeApproval ? 0 : EXPECTED.legacy_urls - EXPECTED.approved_listing_redirects,
  );

  return {
    schema_version: 1,
    artifact_id: ARTIFACT_ID,
    freeze_at: manualAudit.generated_at,
    inputs,
    route_approval: routeApproval || null,
    policy: {
      active_listing: "manual source review status pass against the approved launch-freeze source",
      archived_listing: "manual source review status review, hold, or source_unavailable",
      publication_boundary: "catalog classification is not broker or publication approval",
      archived_surface: "terminal 200, explicitly unavailable, excluded from active search",
      unresolved_content: "propose 410 when no approved equivalent exists; never publish review-only crawl text",
      route_approval_boundary: "approval-required proposals are not deployable until explicitly approved",
    },
    summary: {
      legacy_urls: routes.length,
      catalog: { total: catalog.length, by_state: catalogCounts, publish_ready: 0 },
      routes: { by_status: statusCounts, by_approval_state: approvalCounts },
      contract_ready: (approvalCounts.required || 0) === 0,
    },
    blockers: [
      "30 active-at-freeze listings still need fact normalization and publication approval",
      "135 archived listings need truthful archived 200 surfaces outside active search",
      ...((approvalCounts.required || 0) > 0
        ? ["292 non-listing terminal proposals need explicit human route approval"]
        : []),
    ],
    catalog,
    routes,
  };
}
