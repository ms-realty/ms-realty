import { clientReturnPath, requireClientPage } from "@/features/cases/access";
import { ProposalStatusScreen } from "@/features/proposals/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    command?: string | string[];
    id?: string | string[];
    key?: string | string[];
  }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  const session = await requireClientPage(
    locale,
    clientReturnPath(`/${locale}/proposals/operations`, query, ["command", "id", "key"]),
  );
  return (
    <ProposalStatusScreen
      locale={locale}
      session={session}
      command={query.command}
      id={query.id}
      keyValue={query.key}
    />
  );
}
