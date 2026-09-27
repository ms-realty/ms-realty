// Agency workspace shell on the staff host (O01–O33).

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/staff/[locale]">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
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
