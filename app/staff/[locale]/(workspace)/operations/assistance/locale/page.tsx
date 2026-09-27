// O32: locale.draft proposes text from an exact approved BG source; no approval/write effect.
import { notFound } from "next/navigation";
import { LocaleAssistanceScreen } from "@/features/ai/locale-screen";
import { checkAiLocale } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reference?: string; language?: string; operation?: string }>;
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
    <LocaleAssistanceScreen locale={locale} session={await requireStaffPage(locale)} {...query} />
  );
}
