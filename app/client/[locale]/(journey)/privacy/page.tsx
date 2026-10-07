import { privacyPageSession } from "@/features/privacy/access";
import { ClientPrivacyScreen } from "@/features/privacy/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; receipt?: string }>;
}) {
  const { locale } = await params;
  const session = await privacyPageSession(locale, `/${locale}/privacy`, false);
  return <ClientPrivacyScreen locale={locale} session={session} query={await searchParams} />;
}
