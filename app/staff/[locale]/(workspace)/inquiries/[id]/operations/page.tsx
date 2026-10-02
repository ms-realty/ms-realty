import { checkLocale, OperationScreen } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return (
    <OperationScreen
      locale={locale}
      session={session}
      id={id}
      type={query.type}
      operationKey={query.key}
    />
  );
}
