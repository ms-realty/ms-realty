import { checkLocale, TaskScreen } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ handover?: string }>;
}) {
  const { locale, id } = await params;
  const { handover } = await searchParams;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <TaskScreen locale={locale} session={session} id={id} step={handover} />;
}
