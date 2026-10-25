import { notFound } from "next/navigation";
import { ContentLocaleOperationScreen } from "@/features/content/locale-screens";
import { checkContentLocale } from "@/features/content/screens";
import { isPublicLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; edition: string }>;
  searchParams: Promise<{ kind?: string; key?: string }>;
}) {
  const { locale, id, edition } = await params;
  checkContentLocale(locale);
  const { kind, key } = await searchParams;
  if (
    !isPublicLocale(edition) ||
    edition === "bg" ||
    (kind !== "save" && kind !== "decide") ||
    typeof key !== "string" ||
    key.length > 200
  )
    notFound();
  return (
    <ContentLocaleOperationScreen
      shell={locale}
      id={id}
      target={edition}
      session={await requireStaffPage(locale)}
      kind={kind}
      operationKey={key}
    />
  );
}
