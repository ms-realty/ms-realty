import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { isStaffLocale } from "@/i18n/config";
import { listListingHistory, readListingHistory } from "@/server/audit-history/queries";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { PermissionState } from "../shell/permission-state";
import { auditHistoryCopy } from "./copy";
import { HistoryDetailScreen, HistoryErrorScreen, HistoryListScreen } from "./screens";

type Search = Record<string, string | string[] | undefined>;
export async function AuditHistoryPage({
  locale,
  id,
  search = {},
}: {
  locale: string;
  id?: string;
  search?: Search;
}) {
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const copy = auditHistoryCopy(locale);
  try {
    if (id !== undefined)
      return (
        <HistoryDetailScreen
          locale={locale}
          view={await readListingHistory(getDb(), session.actor, id)}
        />
      );
    // Preserve invalid repeated values for the strict reader to reject; never choose one.
    const input = {
      ...(search.reference !== undefined ? { reference: search.reference } : {}),
      ...(search.cursor !== undefined ? { cursor: search.cursor } : {}),
    };
    return (
      <HistoryListScreen
        locale={locale}
        view={await listListingHistory(getDb(), session.actor, input)}
      />
    );
  } catch (error) {
    if (isAppError(error) && error.code === "forbidden")
      return (
        <PermissionState locale={locale} session={session} title={copy.title} about={copy.lead} />
      );
    if (isAppError(error) && error.code === "not_found") notFound();
    return (
      <HistoryErrorScreen
        locale={locale}
        invalid={isAppError(error) && error.code === "validation_failed"}
      />
    );
  }
}
