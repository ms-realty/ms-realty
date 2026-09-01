import { DURABLE_LEAD_OPERATION_PATHS } from "./lead-durable-boundary.mjs";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const FILE_BACKED_PUBLIC_MUTATIONS = new Set([
  "/api/events",
  "/api/seller-photos",
  "/api/language-requests",
  "/api/saved-searches",
  "/api/saved-searches/manage",
  "/api/viewing-trips",
]);

export const FILE_BACKED_ADMIN_MUTATIONS = new Set([
  "/api/admin/accounts",
  "/api/admin/accounts/link",
  "/api/admin/broker-contacts",
  "/api/admin/consents/withdraw",
  "/api/admin/deals/close",
  "/api/admin/deployable-redirects/export",
  "/api/admin/documents/outcome",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/leads",
  "/api/admin/leads/assign",
  "/api/admin/leads/bulk",
  "/api/admin/leads/snooze",
  "/api/admin/leads/unsnooze",
  "/api/admin/listing-quality/import",
  "/api/admin/listings/publication-schedules",
  "/api/admin/listings/publication-schedules/cancel",
  "/api/admin/listings/publication-schedules/run-due",
  "/api/admin/listings/slug",
  "/api/admin/locales",
  "/api/admin/media/reviews",
  "/api/admin/media/uploads",
  "/api/admin/public-requests/outcome",
  "/api/admin/redirect-approvals",
  "/api/admin/redirect-approvals/import",
  "/api/admin/replies",
  "/api/admin/replies/delivery",
  "/api/admin/replies/draft",
  "/api/admin/saved-search-alerts/run-due",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/tours/approve",
  "/api/admin/translations/approve",
  "/api/admin/translations/draft",
  "/api/admin/translations/publish",
  "/api/admin/viewings",
  "/api/admin/viewings/follow-up",
  "/api/admin/views",
]);

export const FILE_BACKED_ADMIN_READS = new Set([
  "/admin/activity",
  "/admin/consents",
  "/admin/contacts",
  "/admin/documents",
  "/admin/migration/review",
  "/admin/pipeline",
  "/admin/reports",
  "/admin/requests",
  "/admin/viewings",
  "/api/admin/activity",
  "/api/admin/consents",
  "/api/admin/contacts",
  "/api/admin/deployable-redirects",
  "/api/admin/documents",
  "/api/admin/locales",
  "/api/admin/migration/review",
  "/api/admin/pipeline",
  "/api/admin/redirect-approval-workbook",
  "/api/admin/reports",
  "/api/admin/reports/export",
  "/api/admin/requests",
  "/api/admin/viewings",
  "/api/admin/viewings.ics",
  "/api/admin/views",
]);

// The pipeline screens render from the lead-operation ledgers, so once those
// are durable the read has a durable authority behind it too.
const DURABLE_LEAD_OPERATION_READS = ["/admin/pipeline", "/api/admin/pipeline"];

// A production runtime pointed at Payload refuses every file-backed mutation,
// because the disk it would write to is not the authority and does not survive
// a deploy. The public UI has to ask the same question the request boundary
// asks, or it offers forms that can only fail.
export function runtimeDataDurableOnlyFromEnv(env = process.env) {
  return env.NODE_ENV === "production" && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload";
}

// The fixed origin has a named runtime-data volume that is captured together
// with Postgres before every release. Its owner/admin ledgers therefore survive
// deploys; the Cloudflare fallback container does not set this marker and stays
// Payload-only/fail-closed.
export function adminRuntimeDataDurableOnlyFromEnv(env = process.env) {
  return runtimeDataDurableOnlyFromEnv(env) && env.MS_REALTY_ADMIN_RUNTIME_VOLUME_ENABLED !== "true";
}

export function savedSearchWritesDisabledFromEnv(env = process.env) {
  return productionRuntimeDataUnavailable({
    durableOnly: runtimeDataDurableOnlyFromEnv(env),
    method: "POST",
    pathname: "/api/saved-searches",
  });
}

export function productionRuntimeDataUnavailable({
  durableEvent = false,
  durableLeadOperations = false,
  durableMedia = false,
  durableOnly = false,
  durableProviderDelivery = false,
  durableViewingTrip = false,
  durableViewing = false,
  method,
  pathname,
}) {
  if (!durableOnly) return false;
  const path = String(pathname || "");
  const verb = String(method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") {
    if (durableViewing && ["/admin/viewings", "/api/admin/viewings", "/api/admin/viewings.ics"].includes(path)) return false;
    if (durableLeadOperations && DURABLE_LEAD_OPERATION_READS.includes(path)) return false;
    return FILE_BACKED_ADMIN_READS.has(path);
  }
  if (!MUTATING_METHODS.has(verb)) return false;
  if (path === "/api/events" && durableEvent) return false;
  if (path === "/api/viewing-trips" && durableViewingTrip) return false;
  if (path === "/api/admin/replies/delivery" && durableProviderDelivery) return false;
  if (["/api/admin/media/uploads", "/api/admin/media/reviews"].includes(path) && durableMedia) return false;
  if (["/api/admin/viewings", "/api/admin/viewings/follow-up"].includes(path) && durableViewing) return false;
  if (durableLeadOperations && DURABLE_LEAD_OPERATION_PATHS.has(path)) return false;
  return FILE_BACKED_PUBLIC_MUTATIONS.has(path) || FILE_BACKED_ADMIN_MUTATIONS.has(path);
}

export function runtimeDataUnavailablePayload(pathname) {
  return {
    kind: "runtime_data_unavailable",
    message: "This feature is unavailable until it has a durable Postgres authority.",
    path: String(pathname || ""),
  };
}
