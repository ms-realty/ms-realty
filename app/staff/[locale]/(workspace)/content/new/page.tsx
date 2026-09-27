// O21: operator-authored BG source draft.
import { ContentNewScreen, checkContentLocale } from "@/features/content/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkContentLocale(locale);
  return <ContentNewScreen locale={locale} session={await requireStaffPage(locale)} />;
}
