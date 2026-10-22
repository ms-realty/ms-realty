import { ReleaseReadinessPage } from "@/features/operations/readiness-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ReleaseReadinessPage
      locale={(await params).locale}
      readSaved={(await searchParams).read === "saved"}
    />
  );
}
