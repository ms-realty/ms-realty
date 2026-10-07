import { CaseIndexScreen } from "@/features/cases/screens";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <CaseIndexScreen locale={locale} session={session} />;
}
