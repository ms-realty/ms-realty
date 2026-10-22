import { notFound } from "next/navigation";
import { ComplaintReceipt } from "@/features/complaints/screens";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return privateRead(() => ComplaintReceipt({ locale, session, operationKey: query.key ?? "" }));
}
