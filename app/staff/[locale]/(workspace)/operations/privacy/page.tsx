import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { privacyPageSession } from "@/features/privacy/access";
import { StaffPrivacyScreen } from "@/features/privacy/screens";
import { isAppError } from "@/server/errors";
import { privacyOperator } from "@/server/privacy/access";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; receipt?: string }>;
}) {
  const { locale } = await params;
  const session = await privacyPageSession(locale, `/${locale}/operations/privacy`, true);
  await privacyOperator(getDb(), session).catch((error) => {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  });
  return <StaffPrivacyScreen locale={locale} session={session} query={await searchParams} />;
}
