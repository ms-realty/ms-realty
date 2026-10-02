import { checkLocale, InquiryScreen } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function WorkPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);

  return <InquiryScreen locale={locale} session={session} id={id} />;
}
