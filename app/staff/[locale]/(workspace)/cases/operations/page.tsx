import { WorkflowStatusScreen } from "@/features/cases/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
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
    <WorkflowStatusScreen
      locale={locale}
      session={session}
      command={query.command}
      id={query.id}
      operationKey={query.key}
    />
  );
}
