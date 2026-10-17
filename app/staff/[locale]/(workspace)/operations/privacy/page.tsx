import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { privacyPageSession } from "@/features/privacy/access";
import { StaffPrivacyScreen } from "@/features/privacy/screens";
import { isAppError } from "@/server/errors";
import { privacyOperator } from "@/server/privacy/access";
import { privacyQueuePath, privacyQueueQuery } from "@/server/privacy/requests";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; receipt?: string; after?: string; before?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  // Reauthentication returns to the same queue page; a malformed position returns to the newest.
  const position = privacyQueueQuery.safeParse(query).success
    ? { after: query.after, before: query.before }
    : {};
  const session = await privacyPageSession(locale, privacyQueuePath(locale, position), true);
  await privacyOperator(getDb(), session).catch((error) => {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  });
  return <StaffPrivacyScreen locale={locale} session={session} query={query} />;
}
