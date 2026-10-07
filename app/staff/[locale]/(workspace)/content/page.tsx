// O21: permission-scoped editorial content.
import { ContentListScreen, checkContentLocale } from "@/features/content/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkContentLocale(locale);
  return <ContentListScreen locale={locale} session={await requireStaffPage(locale)} />;
}
