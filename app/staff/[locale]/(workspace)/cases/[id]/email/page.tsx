// O17/F13: separate human review of exact external correspondence.
import { CaseEmailScreen } from "@/features/cases/email-screen";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  return <CaseEmailScreen locale={locale} session={session} id={id} />;
}
