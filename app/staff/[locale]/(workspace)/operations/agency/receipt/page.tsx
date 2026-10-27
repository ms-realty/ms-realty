// B10 / AT10 / AT11 / AT40: exact-purpose evidence, current scope and recoverable human commands.
import { AgencyReceipt } from "@/features/agency-obligations/screens";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    draft?: string;
    case?: string;
    party?: string;
    command?: string;
    id?: string;
    key?: string;
  }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return privateRead(() =>
    AgencyReceipt({
      locale,
      session,
      command: query.command ?? "",
      id: query.id ?? "",
      operationKey: query.key ?? "",
    }),
  );
}
