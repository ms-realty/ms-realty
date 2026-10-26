import { DuplicateMergeScreen } from "@/features/duplicate-review/merge-screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

/** O27/F32/AT56/UX22: comparison and mapping selection never mutate business records. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    subject?: string;
    left?: string;
    right?: string;
    survivor?: string;
    key?: string;
    after?: string;
  }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  return <DuplicateMergeScreen locale={locale} session={session} query={await searchParams} />;
}
