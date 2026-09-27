// Agency workspace shell on the staff host (O01–O33).
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { isStaffLocale } from "@/i18n/config";

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/staff/[locale]">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  return <WorkspaceShell locale={locale}>{children}</WorkspaceShell>;
}
