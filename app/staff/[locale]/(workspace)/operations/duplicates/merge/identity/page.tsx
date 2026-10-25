import { DuplicateIdentityScreen } from "@/features/duplicate-review/merge-screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { AppError } from "@/server/errors";

/** O27: navigation may group permitted source identities; authorization never follows aliases. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ subject?: string; id?: string }>;
}) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  if (query.subject !== "party" && query.subject !== "property") throw new AppError("not_found");
  return (
    <DuplicateIdentityScreen
      locale={locale}
      session={session}
      subject={query.subject}
      id={query.id ?? ""}
    />
  );
}
