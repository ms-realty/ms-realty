import { ProposalStatusScreen } from "@/features/proposals/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
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
  checkLocale(locale);
  const session = await requireStaffPage(locale);
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
