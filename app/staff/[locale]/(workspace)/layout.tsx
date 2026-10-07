// Agency workspace shell on the staff host (O01–O33).

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { staffSignInPath } from "@/features/privacy/access";
import { workspaceViewer } from "@/features/shell/viewer";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { isStaffLocale, requestPathHeader } from "@/i18n/config";
import { currentStaffAccess, requireStaffPage } from "@/server/auth/pages";

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/staff/[locale]">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  // Signed out, the guard here runs before any page: keep a validated privacy queue position
  // (C-12) so sign-in returns there; every other state is the usual access route.
  if ((await currentStaffAccess()).state === "signed_out")
    redirect(staffSignInPath(locale, (await headers()).get(requestPathHeader)));
  const session = await requireStaffPage(locale);
  const viewer = await workspaceViewer(locale, session);
  return (
    <WorkspaceShell
      locale={locale}
      account={viewer.account}
      mayManageAccess={viewer.mayManageAccess}
      tools={viewer.tools}
    >
      {children}
    </WorkspaceShell>
  );
}
