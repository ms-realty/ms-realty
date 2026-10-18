import { ReleaseReadinessPage } from "@/features/operations/readiness-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, gate } = await params;
  return (
    <ReleaseReadinessPage
      locale={locale}
      gate={gate}
      impact={(await searchParams).view === "impact"}
    />
  );
}
