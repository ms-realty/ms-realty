// S07 on a staff page the viewer's grants do not cover (M-003): what the page is for, that
// their access does not include it, who can give it and the way back. The read that refused
// stays the authority; nothing it guards is read or shown here.
import "server-only";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { defaultStaffLocale, displayLocale, isStaffLocale } from "@/i18n/config";
import { accessManagerNames } from "@/server/auth/grants";
import type { Session } from "@/server/auth/sessions";
import { buttonClass } from "@/ui/button-class";
import { EmptyState } from "@/ui/empty-state";

export async function PermissionState({
  locale: requested,
  title,
  about,
  session,
  showToday = true,
}: {
  locale: string;
  /** The page's own heading, so the person knows where they are. */
  title: string;
  /** One sentence on what the page is for. */
  about: string;
  session: Session;
  showToday?: boolean;
}) {
  const locale = isStaffLocale(requested) ? requested : defaultStaffLocale;
  const t = await getTranslations({ locale, namespace: "workspaceStates" });
  const managers = await accessManagerNames(getDb(), session);
  const names = new Intl.ListFormat(displayLocale(locale), { type: "disjunction" }).format(
    managers,
  );
  return (
    <div
      data-permission-state=""
      className="flex flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-heading font-semibold sm:text-title">{title}</h1>
        <p className="text-text-muted">{about}</p>
      </header>
      <EmptyState
        kind="inaccessible"
        title={t("permission.title")}
        action={
          showToday ? (
            <a href={`/${locale}/today`} className={buttonClass("secondary")}>
              {t("today")}
            </a>
          ) : undefined
        }
      >
        <p>{managers.length ? t("permission.managers", { names }) : t("permission.noManagers")}</p>
      </EmptyState>
    </div>
  );
}
