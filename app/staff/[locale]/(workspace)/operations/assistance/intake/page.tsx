// O32: explicit immutable broker-note selection; PDF/document extraction is unavailable.
import { notFound } from "next/navigation";
import { IntakeAssistanceScreen } from "@/features/ai/intake-screen";
import { checkAiLocale } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reference?: string; operation?: string }>;
}) {
  const { locale } = await params;
  checkAiLocale(locale);
  const query = await searchParams;
  if (
    Object.values(query).some(
      (value) => value !== undefined && (typeof value !== "string" || value.length > 200),
    )
  )
    notFound();
  return (
    <IntakeAssistanceScreen locale={locale} session={await requireStaffPage(locale)} {...query} />
  );
}
