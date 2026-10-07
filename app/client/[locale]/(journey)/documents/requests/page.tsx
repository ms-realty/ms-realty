import { requireClientPage } from "@/features/cases/access";
import { DocumentRequestsScreen } from "@/features/document-requests/screens";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <DocumentRequestsScreen
      locale={locale}
      session={await requireClientPage(locale, `/${locale}/documents/requests`)}
    />
  );
}
