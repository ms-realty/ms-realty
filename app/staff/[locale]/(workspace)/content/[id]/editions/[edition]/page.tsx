// O21 / F24 / AT22 / AT23: staff shell and target content language are independent.
import { notFound } from "next/navigation";
import { ContentLocaleScreen } from "@/features/content/locale-screens";
import { checkContentLocale } from "@/features/content/screens";
import { isPublicLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; edition: string }>;
}) {
  const { locale, id, edition } = await params;
  checkContentLocale(locale);
  if (!isPublicLocale(edition) || edition === "bg") notFound();
  return (
    <ContentLocaleScreen
      shell={locale}
      id={id}
      target={edition}
      session={await requireStaffPage(locale)}
    />
  );
}
