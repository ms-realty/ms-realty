import type { CalendarSearch } from "@/features/appointments/calendar-period";
import { CalendarScreen } from "@/features/appointments/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CalendarSearch>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <CalendarScreen locale={locale} session={session} search={await searchParams} />;
}
