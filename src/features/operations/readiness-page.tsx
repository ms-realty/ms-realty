import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { isStaffLocale } from "@/i18n/config";
import { type GateId, gateIds } from "@/release/schemas";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { readReleaseOverview, runtimeReadinessInput } from "@/server/ops/readiness-view";
import { PermissionState } from "../shell/permission-state";
import { operationsCopy } from "./copy";
import { ReleaseReadinessScreen } from "./readiness-screen";

export async function ReleaseReadinessPage({
  locale,
  gate,
  impact,
  readSaved,
}: {
  locale: string;
  gate?: string;
  impact?: boolean;
  readSaved?: boolean;
}) {
  if (!isStaffLocale(locale) || (gate !== undefined && !gateIds.includes(gate as GateId)))
    notFound();
  const session = await requireStaffPage(locale);
  const copy = operationsCopy(locale);
  try {
    const view = await readReleaseOverview(getDb(), session.actor, await runtimeReadinessInput());
    return (
      <ReleaseReadinessScreen
        locale={locale}
        view={view}
        selected={gate as GateId | undefined}
        impact={impact}
        readSaved={readSaved}
      />
    );
  } catch (error) {
    if (isAppError(error) && error.code === "forbidden")
      return (
        <PermissionState locale={locale} session={session} title={copy.title} about={copy.lead} />
      );
    throw error;
  }
}
