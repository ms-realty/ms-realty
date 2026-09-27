import { requireClientPage } from "@/features/cases/access";
import { ClientDocumentsScreen } from "@/features/cases/documents";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await requireClientPage(locale);
  return <ClientDocumentsScreen locale={locale} session={session} id={id} />;
}
