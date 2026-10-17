import { requireClientPage } from "@/features/cases/access";
import { CaseScreen } from "@/features/cases/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await requireClientPage(locale, `/${locale}/messages/${encodeURIComponent(id)}`);

  return <CaseScreen locale={locale} session={session} id={id} pane="messages" />;
}
