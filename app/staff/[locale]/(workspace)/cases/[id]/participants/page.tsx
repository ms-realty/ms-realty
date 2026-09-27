import { CaseAccessScreen } from "@/features/case-access/screens";
import { requireStaffPage } from "@/server/auth/pages";
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
      session={await requireStaffPage(locale)}
      query={await searchParams}
    />
  );
}
