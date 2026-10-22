import { ReleaseReadinessPage } from "@/features/operations/readiness-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, gate } = await params;
  const query = await searchParams;
  return (
    <ReleaseReadinessPage
      locale={locale}
      gate={gate}
      impact={query.view === "impact"}
      readSaved={query.read === "saved"}
    />
  );
}
