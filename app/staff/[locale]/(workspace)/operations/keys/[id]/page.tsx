import { notFound } from "next/navigation";
import { CustodyDetail } from "@/features/key-custody/screens";
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
  return privateRead(() => CustodyDetail({ locale, session, id, before: query.before }));
}
