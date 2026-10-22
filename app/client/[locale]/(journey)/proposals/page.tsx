import { clientReturnPath, requireClientPage } from "@/features/cases/access";
import { ProposalIndexScreen } from "@/features/proposals/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ case?: string | string[] }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  const session = await requireClientPage(
    locale,
    clientReturnPath(`/${locale}/proposals`, query, ["case"]),
  );
  return (
    <ProposalIndexScreen
      locale={locale}
      session={session}
      caseId={typeof query.case === "string" ? query.case : undefined}
    />
  );
}
