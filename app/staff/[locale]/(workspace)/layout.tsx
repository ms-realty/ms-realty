// Agency workspace shell on the staff host (O01–O33).

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { staffSignInPath } from "@/features/privacy/access";
import { sidebarMode, sidebarPreferenceCookie } from "@/features/shell/navigation-preference";
import { workspaceViewer } from "@/features/shell/viewer";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { staffWorkflowCopy } from "@/features/work/workflow-completion-copy";
import { isStaffLocale, requestPathHeader } from "@/i18n/config";
import { currentStaffAccess, requireStaffPage } from "@/server/auth/pages";
import { workspaceCounts } from "@/server/work/workspace-search";

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/staff/[locale]">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  // F13/C-12: preserve a validated navigation destination through initial sign-in.
  const access = await currentStaffAccess();
  if (access.state === "signed_out")
    redirect(staffSignInPath(locale, (await headers()).get(requestPathHeader)));
  // Reuse this request's verified access result. Each destination still runs its own guard.
  const session = access.state === "ready" ? access.session : await requireStaffPage(locale);
  const viewer = await workspaceViewer(locale, session);
  const counts = await workspaceCounts(getDb(), session);
  return (
    <WorkspaceShell
      locale={locale}
      account={viewer.account}
      mayManageAccess={viewer.mayManageAccess}
      tools={viewer.tools}
      primary={viewer.primary}
      initialMode={sidebarMode((await cookies()).get(sidebarPreferenceCookie)?.value)}
      returnTo={(await headers()).get(requestPathHeader) ?? `/${locale}/today`}
      counts={counts}
      search={
        <a
          className="inline-flex min-h-control items-center px-3 font-semibold text-link underline"
          href={`/${locale}/search`}
        >
          {staffWorkflowCopy(locale).search}
        </a>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
