import { DuplicateMergeReceiptScreen } from "@/features/duplicate-review/merge-screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

/** O27/F32: own durable result, reauthorized against both original sources. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return <DuplicateMergeReceiptScreen locale={locale} session={session} id={query.id ?? ""} />;
}
