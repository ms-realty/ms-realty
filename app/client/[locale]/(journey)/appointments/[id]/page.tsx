import { AppointmentScreen } from "@/features/appointments/screens";
import { requireClientPage } from "@/features/cases/access";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await requireClientPage(
    locale,
    `/${locale}/appointments/${encodeURIComponent(id)}`,
  );

  return <AppointmentScreen locale={locale} session={session} id={id} />;
}
