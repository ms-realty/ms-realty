import { checkLocale, InboxScreen, queryPage } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return (
    <InboxScreen locale={locale} session={session} view={query.view} page={queryPage(query.page)} />
  );
}
