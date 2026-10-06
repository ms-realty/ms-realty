// O03 inquiry detail, beside the O02 queue on wide screens (?view= and ?page= keep its place).
import { checkLocale, InquiryScreen, queryPage } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return (
    <InquiryScreen
      locale={locale}
      session={session}
      id={id}
      view={query.view}
      page={queryPage(query.page)}
    />
  );
}
