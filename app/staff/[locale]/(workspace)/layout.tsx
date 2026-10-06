// Agency workspace shell on the staff host (O01–O33).

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { staffSignInPath } from "@/features/privacy/access";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { isStaffLocale, requestPathHeader } from "@/i18n/config";
import { currentStaffAccess, requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";

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
  const db = getDb();
  const [principal] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, session.account.id));
  return (
    <WorkspaceShell
      locale={locale}
      account={{ name: principal?.name ?? "MS Realty" }}
      mayManageAccess={await can(db, session.actor, "access.grant")}
    >
      {children}
    </WorkspaceShell>
  );
}
