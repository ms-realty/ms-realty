import { checkLocale, TodayScreen } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <TodayScreen locale={locale} session={session} />;
}
