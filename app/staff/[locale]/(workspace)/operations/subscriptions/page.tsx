import { notFound } from "next/navigation";
import { AlertRuleScreen } from "@/features/subscriptions/screen";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; receipt?: string }>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  try {
    return await AlertRuleScreen({ locale, session, query: await searchParams });
  } catch (error) {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  }
}
