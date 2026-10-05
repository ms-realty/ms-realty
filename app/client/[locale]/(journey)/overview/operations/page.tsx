import { clientReturnPath, requireClientPage } from "@/features/cases/access";
import { WorkflowStatusScreen } from "@/features/cases/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const session = await requireClientPage(
    locale,
    clientReturnPath(`/${locale}/overview/operations`, query, ["command", "id", "key"]),
  );
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
