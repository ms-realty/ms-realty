// O32 / AT53: durable draft outcome and human review against the current source.
import { AssistanceRunScreen, checkAiLocale } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  checkAiLocale(locale);
  return <AssistanceRunScreen locale={locale} id={id} session={await requireStaffPage(locale)} />;
}
