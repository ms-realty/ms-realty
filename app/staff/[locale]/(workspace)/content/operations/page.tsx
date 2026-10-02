import { notFound } from "next/navigation";
import { ContentOperationScreen, checkContentLocale } from "@/features/content/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string; key?: string; id?: string }>;
}) {
  const { locale } = await params;
  checkContentLocale(locale);
  const session = await requireStaffPage(locale),
    { kind, key, id } = await searchParams;
  if (
    (kind !== "create" && kind !== "save" && kind !== "decide") ||
    typeof key !== "string" ||
    key.length > 200 ||
    (id !== undefined && typeof id !== "string")
  )
    notFound();
  return (
    <ContentOperationScreen
      locale={locale}
      session={session}
      kind={kind}
      operationKey={key}
      {...(id ? { id } : {})}
    />
  );
}
