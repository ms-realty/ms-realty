import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PublicShell } from "@/features/shell/public-shell";
import { AnalyticsConsent } from "@/features/tracking/consent";
import { isRoutableLocale } from "@/i18n/config";
import { analyticsPreference, trackingConfig } from "@/i18n/tracking";

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const config = trackingConfig();
  const requestHeaders = await headers();
  // Share-token pages never mount analytics, even after a stored grant.
  const notice =
    config.gtmContainerId && requestHeaders.get("x-msr-share-token-route") !== "1" ? (
      <AnalyticsConsent
        locale={locale}
        initialPreference={analyticsPreference(requestHeaders.get("cookie"))}
        containerId={config.gtmContainerId}
        nonce={requestHeaders.get("x-nonce") ?? undefined}
      />
    ) : null;
  return (
    <PublicShell locale={locale} notice={notice}>
      {children}
    </PublicShell>
  );
}
