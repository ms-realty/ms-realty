import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { sidebarMode, sidebarPreferenceCookie } from "@/features/shell/navigation-preference";
import { workspaceViewer } from "@/features/shell/viewer";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { requestPathHeader, type StaffLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { ChevronStartIcon } from "@/ui/icons";
import { settingsCopy } from "./settings-copy";

/** Already authorized staff settings retain the workspace; sign-in/enrollment stays separate. */
export async function StaffSettingsFrame({
  locale,
  session,
  title,
  lead,
  children,
  backHref,
}: {
  locale: StaffLocale;
  session: Session;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  backHref?: string;
}) {
  const [viewer, jar, requestHeaders] = await Promise.all([
    workspaceViewer(locale, session),
    cookies(),
    headers(),
  ]);
  return (
    <WorkspaceShell
      locale={locale}
      account={viewer.account}
      mayManageAccess={viewer.mayManageAccess}
      primary={viewer.primary}
      tools={viewer.tools}
      initialMode={sidebarMode(jar.get(sidebarPreferenceCookie)?.value)}
      returnTo={requestHeaders.get(requestPathHeader) ?? `/${locale}/settings`}
    >
      <div className="mx-auto w-full max-w-5xl px-gutter py-6 lg:px-8 lg:py-8">
        <a
          href={backHref ?? `/${locale}/settings?section=agency`}
          className="mb-5 inline-flex min-h-control items-center gap-2 rounded-control text-dense font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronStartIcon directional />
          {settingsCopy(locale).openSettings}
        </a>
        <div className="flex max-w-reading flex-col gap-6">
          <div className="space-y-3">
            <h1 className="text-page font-semibold">{title}</h1>
            {lead ? <p className="text-text-muted">{lead}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </WorkspaceShell>
  );
}
