import { requireClientPage } from "@/features/cases/access";
import { CaseIndexScreen } from "@/features/cases/screens";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireClientPage(locale);

  return <CaseIndexScreen locale={locale} session={session} destination="messages" />;
}
