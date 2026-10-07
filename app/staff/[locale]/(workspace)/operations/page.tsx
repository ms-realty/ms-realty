// X02 «Инструменти на агенцията» (Figma 22:1103 desktop, 23:4648 mobile): the rail's «Още
// инструменти», and the phone menu's own page when JavaScript is unavailable. A focused state:
// the workspace chrome steps aside, and Close returns to the page the person came from.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AgencyTools } from "@/features/shell/agency-tools";
import { toolsReturnPath } from "@/features/shell/return-path";
import { workspaceViewer } from "@/features/shell/viewer";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const viewer = await workspaceViewer(locale, await requireStaffPage(locale));
  const back = toolsReturnPath(
    (await headers()).get("referer"),
    getEnv().hosts.staff,
    locale,
    `/${locale}/operations`,
  );
  return (
    <div
      data-focused-state
      className="flex min-h-dvh items-start justify-center bg-subtle p-5 sm:p-16"
    >
      <AgencyTools
        locale={locale}
        groups={viewer.tools}
        idPrefix="agency-tools"
        level={1}
        closeHref={back}
        account={viewer.account}
      />
    </div>
  );
}
