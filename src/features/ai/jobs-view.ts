// O27 Jobs search parameters: ?action=<uuid> opens one exception, ?view=exceptions&page=N pages
// the exception queue. Returns undefined for the overview and null for a malformed request.
import type { ExternalActionView } from "@/server/ai/operations";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function externalActionView(
  search: Record<string, string | string[] | undefined>,
): ExternalActionView | undefined | null {
  if (search.action !== undefined)
    return typeof search.action === "string" && uuid.test(search.action)
      ? { kind: "record", id: search.action }
      : null;
  if (search.view !== "exceptions") return undefined;
  if (Array.isArray(search.page)) return null;
  const page = search.page === undefined ? 1 : Number(search.page);
  return Number.isSafeInteger(page) && page >= 1 && Number.isSafeInteger((page - 1) * 30)
    ? { kind: "queue", page }
    : null;
}
