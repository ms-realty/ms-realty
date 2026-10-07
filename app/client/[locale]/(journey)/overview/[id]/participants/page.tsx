import { CaseAccessScreen } from "@/features/case-access/screens";
import { clientReturnPath, requireClientPage } from "@/features/cases/access";
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
    <CaseAccessScreen
      locale={locale}
      id={id}
      session={
        await requireClientPage(
          locale,
          clientReturnPath(`/${locale}/overview/${encodeURIComponent(id)}/participants`, query, [
            "command",
            "key",
          ]),
        )
      }
      query={query}
    />
  );
}
