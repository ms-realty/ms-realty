import { clientReturnPath, requireClientPage } from "@/features/cases/access";
import { DocumentRequestsScreen } from "@/features/document-requests/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  return (
    <DocumentRequestsScreen
      locale={locale}
      id={id}
      session={
        await requireClientPage(
          locale,
          clientReturnPath(`/${locale}/documents/requests/${encodeURIComponent(id)}`, query, [
            "saved",
            "error",
          ]),
        )
      }
      query={query}
    />
  );
}
