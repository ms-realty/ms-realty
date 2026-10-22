// O21 / AT22: exact immutable edition review and explicit publication.
import { ContentWorkbenchScreen, checkContentLocale } from "@/features/content/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  checkContentLocale(locale);
  return (
    <ContentWorkbenchScreen locale={locale} id={id} session={await requireStaffPage(locale)} />
  );
}
