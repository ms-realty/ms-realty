// O04 cases index (Figma 14:1847 / 14:4522): the staff screen lives in
// src/features/cases/directory-screen.tsx; the client host keeps its own case chooser.
import { CaseDirectoryScreen } from "@/features/cases/directory-screen";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  // One value per parameter: a repeated ?q= keeps its first value.
  const { q } = await searchParams;
  return (
    <CaseDirectoryScreen locale={locale} session={session} search={Array.isArray(q) ? q[0] : q} />
  );
}
