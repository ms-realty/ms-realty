import { CaseAccessScreen } from "@/features/case-access/screens";
import { requireClientPage } from "@/features/cases/access";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  return (
    <CaseAccessScreen
      locale={locale}
      id={id}
      session={await requireClientPage(locale)}
      query={await searchParams}
    />
  );
}
