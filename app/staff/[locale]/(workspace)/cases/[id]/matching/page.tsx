// O07 matching workbench «Подбор на имоти» (design/contracts/o07.md; W05, F21).
import { CaseMatchingScreen } from "@/features/cases/matching-screen";
import { parseMatchingQuery } from "@/features/cases/matching-view";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return (
    <CaseMatchingScreen
      locale={locale}
      session={session}
      id={id}
      query={parseMatchingQuery(await searchParams)}
    />
  );
}
