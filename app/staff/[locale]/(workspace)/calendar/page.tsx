import { CalendarScreen } from "@/features/appointments/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <CalendarScreen locale={locale} session={session} />;
}
