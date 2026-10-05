import { CalendarScreen } from "@/features/appointments/screens";
import { requireClientPage } from "@/features/cases/access";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireClientPage(locale, `/${locale}/appointments`);

  return <CalendarScreen locale={locale} session={session} />;
}
