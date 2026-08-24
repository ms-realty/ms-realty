// These admin operations still append lead workflow state to local files.
// When durable lead intake is enabled, accepting any of them would split one
// lead across Postgres and ephemeral storage, so both HTTP adapters reject the
// exact same surface until each workflow has a transactional durable writer.
export const FILE_BACKED_LEAD_MUTATION_PATHS = new Set([
  "/api/admin/replies",
  "/api/admin/replies/delivery",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/leads",
  "/api/admin/leads/assign",
  "/api/admin/leads/snooze",
  "/api/admin/leads/unsnooze",
  "/api/admin/leads/bulk",
  "/api/admin/accounts",
  "/api/admin/accounts/link",
  "/api/admin/documents/outcome",
  "/api/admin/consents/withdraw",
  "/api/admin/replies/draft",
  "/api/admin/viewings",
  "/api/admin/viewings/follow-up",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/deals/close",
  "/api/admin/consents/withdraw",
]);

// The lead-inbox verbs that now have a durable operations authority. Each is
// exempted the same way /api/admin/viewings is: only once the store that backs
// it is actually enabled and configured.
export const DURABLE_LEAD_OPERATION_PATHS = new Set([
  "/api/admin/leads/assign",
  "/api/admin/leads/bulk",
  "/api/admin/leads/snooze",
  "/api/admin/leads/unsnooze",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/deals/close",
  "/api/admin/consents/withdraw",
]);

export function isFileBackedLeadMutationBlocked({
  durableLeadOperations = false,
  durableProviderDelivery = false,
  durableStore,
  durableViewing = false,
  method,
  pathname,
} = {}) {
  const path = String(pathname || "");
  if (
    durableStore?.leadDurableStoreEnabled !== true ||
    String(method || "GET").toUpperCase() === "GET" ||
    !FILE_BACKED_LEAD_MUTATION_PATHS.has(path)
  ) {
    return false;
  }
  if (path === "/api/admin/replies/delivery" && durableProviderDelivery) return false;
  if (["/api/admin/viewings", "/api/admin/viewings/follow-up"].includes(path) && durableViewing) return false;
  if (durableLeadOperations && DURABLE_LEAD_OPERATION_PATHS.has(path)) return false;
  return true;
}
