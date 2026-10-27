// B10 / AT10 / AT11 / AT40: exact-purpose evidence, current scope and recoverable human commands.
import { PartnerScreen } from "@/features/agency-obligations/screens";
import { checkLocale, privateRead, queryPage } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    draft?: string;
    case?: string;
    party?: string;
    command?: string;
    id?: string;
    key?: string;
    page?: string;
    returnTo?: string | string[];
  }>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return privateRead(() =>
    PartnerScreen({
      locale,
      session,
      id,
      draft: query.draft,
      caseId: query.case,
      partyId: query.party,
      page: queryPage(query.page),
      returnTo: typeof query.returnTo === "string" ? query.returnTo : undefined,
    }),
  );
}
