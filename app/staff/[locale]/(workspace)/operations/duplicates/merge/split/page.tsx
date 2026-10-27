import { DuplicateSplitScreen } from "@/features/duplicate-review/merge-screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

/** O27/AT56: review an exact safe split; incompatible subsequent work remains held. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string; key?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return (
    <DuplicateSplitScreen
      locale={locale}
      session={session}
      id={query.id ?? ""}
      operationKey={query.key}
    />
  );
}
