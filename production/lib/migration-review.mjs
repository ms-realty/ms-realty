import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_MIGRATION_REVIEW_OUTPUT = fromRoot("production", "data", "migration-review-queue.json");

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function reviewOwner(record) {
  if (record.source_domain === "makler-realty.ru") return "ru_preservation_editor";
  if (record.url_type === "listing") return "broker_listing_reviewer";
  if (record.url_type === "taxonomy") return "seo_taxonomy_editor";
  return "content_editor";
}

function actionRequired(record) {
  if (record.url_type === "listing") return "approve_same_content_listing_redirect";
  if (record.url_type === "taxonomy") return "map_or_rebuild_taxonomy_landing";
  if (record.url_type === "post") return "map_or_archive_post_with_equivalent";
  return "map_or_rebuild_content_page";
}

function gapNames(gaps = {}) {
  return Object.entries(gaps)
    .filter(([, missing]) => missing)
    .map(([name]) => name);
}

function riskFlags(record, route, gaps) {
  return [
    record.source_domain === "makler-realty.ru" ? "ru_preservation" : null,
    route?.target_path ? null : "no_target_route",
    gaps.includes("missingSchema") ? "schema_gap" : null,
    gaps.includes("missingDescription") ? "description_gap" : null,
    record.url_type !== "listing" ? "non_listing_content_review" : null,
  ].filter(Boolean);
}

function priority(record, route, gaps) {
  if (record.source_domain === "makler-realty.ru") return "high";
  if (record.url_type === "listing") return "high";
  if (!route?.target_path || gaps.length) return "medium";
  return "low";
}

export function attachMigrationReviewEvidence(routes, records) {
  const recordsByUrl = new Map(records.map((record) => [record.old_url, record]));
  return routes.map((route) => {
    const record = recordsByUrl.get(route.old_url);
    if (!record) return route;
    const gaps = gapNames(record.metadata_gaps);
    return {
      ...route,
      source_evidence: {
        title: record.title || "",
        h1: record.h1 || "",
        canonical: record.canonical || "",
        word_count: Number(record.word_count || 0),
        image_count: Number(record.image_count || 0),
        internal_link_count: Number(record.internal_link_count || 0),
        migration_action: record.migration_action || "",
        review_owner: reviewOwner(record),
        action_required: actionRequired(record),
        priority: priority(record, route, gaps),
        metadata_gaps: gaps,
      },
    };
  });
}

function readableLegacyUrl(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function normalizedFilter(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

export function filterMigrationReviewRoutes(routes, requestedFilters = {}) {
  const filters = {
    q: normalizedFilter(requestedFilters.q),
    type: normalizedFilter(requestedFilters.type, 40),
    domain: normalizedFilter(requestedFilters.domain, 160),
  };
  const query = filters.q.toLocaleLowerCase();
  const rows = routes
    .filter((route) => !filters.type || route.url_type === filters.type)
    .filter((route) => !filters.domain || route.source_domain === filters.domain)
    .filter((route) => {
      if (!query) return true;
      const evidence = route.source_evidence || {};
      return [
        route.old_url,
        readableLegacyUrl(route.old_url),
        route.target_path,
        evidence.title,
        evidence.h1,
        evidence.canonical,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    });
  return {
    rows,
    filters,
    filterOptions: {
      types: [...new Set(routes.map((route) => route.url_type).filter(Boolean))].sort(),
      domains: [...new Set(routes.map((route) => route.source_domain).filter(Boolean))].sort(),
    },
  };
}

export function buildMigrationReviewQueue(records, routeMap) {
  const routesByUrl = new Map(routeMap.map((route) => [route.old_url, route]));
  const rows = records.map((record) => {
    const route = routesByUrl.get(record.old_url) || {};
    const gaps = gapNames(record.metadata_gaps);
    return {
      id: record.id,
      old_url: record.old_url,
      source_domain: record.source_domain,
      url_type: record.url_type,
      admin_locale: record.source_domain === "makler-realty.ru" ? "ru" : "bg",
      review_owner: reviewOwner(record),
      priority: priority(record, route, gaps),
      action_required: actionRequired(record),
      review_state: record.review_state,
      target_path: route.target_path || null,
      deployable: route.deployable === true,
      metadata_gaps: gaps,
      risk_flags: riskFlags(record, route, gaps),
    };
  });

  const nonListingUnmapped = rows.filter((row) => row.url_type !== "listing" && !row.target_path).length;
  const listingRedirectReviews = rows.filter((row) => row.url_type === "listing" && row.target_path && !row.deployable).length;

  return {
    artifact_id: "migration-review-queue-20260704",
    summary: {
      total: rows.length,
      byOwner: countBy(rows, (row) => row.review_owner),
      byType: countBy(rows, (row) => row.url_type),
      byAdminLocale: countBy(rows, (row) => row.admin_locale),
      byPriority: countBy(rows, (row) => row.priority),
      nonListingUnmapped,
      listingRedirectReviews,
      metadataGapRows: rows.filter((row) => row.metadata_gaps.length).length,
      ruRows: rows.filter((row) => row.source_domain === "makler-realty.ru").length,
      deployableRows: rows.filter((row) => row.deployable).length,
    },
    rows,
  };
}

export function assertMigrationReviewQueue(queue) {
  if (queue.summary.total !== 457) throw new Error("Migration review queue must cover every crawled URL");
  if (queue.summary.ruRows !== 179) throw new Error("Migration review queue must preserve all RU rows");
  if (queue.summary.nonListingUnmapped !== 292) throw new Error("Non-listing rows must remain unmapped until editorial review");
  if (queue.summary.listingRedirectReviews !== 165) throw new Error("Listing rows must stay in redirect review until approved");
  if (queue.summary.deployableRows !== 0) throw new Error("Review queue must not make rows deployable");
  if (queue.summary.byOwner.ru_preservation_editor !== 179) throw new Error("RU rows need a dedicated preservation owner");
  return queue.summary;
}

export function writeMigrationReviewQueue(queue, outPath = DEFAULT_MIGRATION_REVIEW_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertMigrationReviewQueue(queue);
  fs.writeFileSync(outPath, `${JSON.stringify(queue, null, 2)}\n`);
  return { outPath, summary };
}
