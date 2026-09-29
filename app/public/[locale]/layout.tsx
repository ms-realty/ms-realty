import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { DisclosureBehavior } from "@/features/shell/disclosure-behavior";
import { isRoutableLocale, localeDirection } from "@/i18n/config";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { preloadFonts } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Root layout of the public host (makler-realty.com, §11.1): lang/dir come from the URL.

export const metadata: Metadata = {
  title: { template: "%s · MS Realty", default: "MS Realty" },
  icons: { icon: "/brand/logo-ms-realty.png" },
  // Safe default. A page opts into indexing through localizedMetadata (spec §20.4).
  robots: { index: false, follow: false },
};

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
        <DisclosureBehavior />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
