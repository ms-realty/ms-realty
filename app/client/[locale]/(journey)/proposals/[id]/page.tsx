import { requireClientPage } from "@/features/cases/access";
import { ProposalScreen } from "@/features/proposals/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await requireClientPage(locale, `/${locale}/proposals/${encodeURIComponent(id)}`);
  return <ProposalScreen locale={locale} session={session} id={id} />;
}
