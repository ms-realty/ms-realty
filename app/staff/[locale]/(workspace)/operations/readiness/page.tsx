import { ReleaseReadinessPage } from "@/features/operations/readiness-page";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ReleaseReadinessPage locale={(await params).locale} />;
}
