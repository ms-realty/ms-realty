import "../../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { DisclosureBehavior } from "@/features/shell/disclosure-behavior";
import { isRoutableLocale, localeDirection } from "@/i18n/config";
import { stagingEnabled } from "@/i18n/seo";
import { organizationStructuredData } from "@/i18n/structured-data";
import { trackingConfig } from "@/i18n/tracking";
import { publicSeoOrigin } from "@/server/seo/public-metadata";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { preloadFonts } from "@/ui/fonts";
import { LiveAnnouncer } from "@/ui/live-announcer";
import { LocaleProvider } from "@/ui/locale-provider";
import { StructuredData } from "@/ui/structured-data";
import { appViewport } from "@/ui/viewport";

// Root layout of the public host (makler-realty.com, §11.1): lang/dir come from the URL.
export const viewport: Viewport = appViewport;

export async function generateMetadata(): Promise<Metadata> {
  const config = trackingConfig();
  return {
    title: { template: "%s · MS Realty", default: "MS Realty" },
    icons: { icon: "/brand/logo-ms-realty.png" },
    robots: { index: !stagingEnabled(), follow: !stagingEnabled() },
    ...(config.googleVerification ? { verification: { google: config.googleVerification } } : {}),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/public/[locale]">) {
  // Dynamic rendering is required for the per-request CSP nonce, 404s included.
  await connection();
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  setRequestLocale(locale);
  preloadFonts(locale);

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body>
        <CspNonceMeta />
        <LiveAnnouncer />
        <StructuredData value={organizationStructuredData(publicSeoOrigin())} />
        <DisclosureBehavior />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
