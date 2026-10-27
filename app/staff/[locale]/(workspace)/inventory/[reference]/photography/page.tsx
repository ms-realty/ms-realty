// O09 / F23 / AT30 / AT40: property-work entry without a buyer Case or Interest.
import { PhotographyScreen } from "@/features/agency-obligations/screens";
import { checkLocale, privateRead } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{
    draft?: string;
    case?: string;
    party?: string;
    command?: string;
    id?: string;
    key?: string;
  }>;
}) {
  const { locale, reference } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    _query = await searchParams;
  return privateRead(() => PhotographyScreen({ locale, session, reference }));
}
