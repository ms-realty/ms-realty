import { requireClientPage } from "@/features/cases/access";
import { ClientDocumentsScreen } from "@/features/cases/documents";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireClientPage(locale, `/${locale}/documents`);
  return <ClientDocumentsScreen locale={locale} session={session} />;
}
