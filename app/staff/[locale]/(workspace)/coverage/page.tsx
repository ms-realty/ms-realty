import { CoverageScreen } from "@/features/work/coverage-screen";
import { checkLocale, queryPage } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

// O01 / architecture §6.6: effective coverage after membership revocation.
export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  return (
    <CoverageScreen locale={locale} session={session} page={queryPage((await searchParams).page)} />
  );
}
