import { checkLocale, queryPage, TasksScreen } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return (
    <TasksScreen
      locale={locale}
      session={session}
      mine={query.view === "mine"}
      overdue={query.view === "overdue"}
      awaitingAcceptance={query.view === "handovers"}
      page={queryPage(query.page)}
    />
  );
}
