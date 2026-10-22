import { ProcessReceipt } from "@/features/compliance/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { locale, id } = await params,
    session = await requireStaffPage(locale);
  return (
    <ProcessReceipt
      locale={locale}
      id={id}
      session={session}
      operationKey={(await searchParams).key ?? ""}
    />
  );
}
