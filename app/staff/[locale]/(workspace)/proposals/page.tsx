import { ProposalIndexScreen } from "@/features/proposals/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ case?: string | string[] }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  return (
    <ProposalIndexScreen
      locale={locale}
      session={session}
      caseId={typeof query.case === "string" ? query.case : undefined}
    />
  );
}
