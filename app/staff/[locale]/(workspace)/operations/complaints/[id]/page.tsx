import { notFound } from "next/navigation";
import { ComplaintDetail } from "@/features/complaints/screens";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { locale, id } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return privateRead(() => ComplaintDetail({ locale, session, id, before: query.before }));
}
