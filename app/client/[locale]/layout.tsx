import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { DisclosureBehavior } from "@/features/shell/disclosure-behavior";
import { isRoutableLocale, localeDirection } from "@/i18n/config";
import { privateRobots } from "@/i18n/seo";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { preloadFonts } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Root layout of the client host (my.makler-realty.com, §11.1): the seven public locales,
// lang/dir from the URL. Access control, not robots, keeps it private (§20.4).

export const metadata: Metadata = {
  title: { template: "%s · MS Realty", default: "MS Realty" },
  icons: { icon: "/brand/favicon.svg" },
  robots: privateRobots,
};

export default async function ClientLayout({ children, params }: LayoutProps<"/client/[locale]">) {
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
