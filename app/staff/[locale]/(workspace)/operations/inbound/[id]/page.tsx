import { notFound } from "next/navigation";
import { InboundDetail } from "@/features/inbound/screen";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    q?: string;
    case?: string;
    receipt?: string;
    importReceipt?: string;
    error?: string;
  }>;
}) {
  const { locale, id } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return privateRead(() => InboundDetail({ locale, session, id, query }));
}
