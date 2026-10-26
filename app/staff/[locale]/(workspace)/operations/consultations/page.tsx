// O29 / F27 / F28: filtered consultation work, including held historical follow-up.
import { notFound } from "next/navigation";
import { ServiceQueueScreen } from "@/features/service-intake/queue";
import { privateRead, queryPage } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    query = await searchParams;
  return privateRead(() => ServiceQueueScreen({ locale, session, page: queryPage(query.page) }));
}
