import { NewCaseScreen } from "@/features/cases/screens";
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
  const query = await searchParams;
  return (
    <NewCaseScreen
      locale={locale}
      session={session}
      inquiryId={typeof query.inquiry === "string" ? query.inquiry : ""}
    />
  );
}
