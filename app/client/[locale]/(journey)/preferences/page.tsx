import type { PublicLocale } from "@/domain/ids";
import { privacyPageSession } from "@/features/privacy/access";
import { PreferencesScreen } from "@/features/privacy/screens";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; receipt?: string }>;
}) {
  const { locale } = await params;
  const session = await privacyPageSession(locale, `/${locale}/preferences`, false);
  return (
    <PreferencesScreen
      locale={locale as PublicLocale}
      session={session}
      query={await searchParams}
    />
  );
}
