import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { DisclosureBehavior } from "@/features/shell/disclosure-behavior";
import { isStaffLocale } from "@/i18n/config";
import { privateRobots } from "@/i18n/seo";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { preloadFonts } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Root layout of the staff host (app.makler-realty.com, §11.1): staff locales bg/en/ru from
// the URL (§03.1). The interface language changes labels and formatting, never data or access.

export const metadata: Metadata = {
  title: { template: "%s · MS Realty workspace", default: "MS Realty workspace" },
  icons: { icon: "/brand/favicon.svg" },
  robots: privateRobots,
};

export default async function StaffLayout({ children, params }: LayoutProps<"/staff/[locale]">) {
  // Dynamic rendering is required for the per-request CSP nonce, 404s included.
  await connection();
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  setRequestLocale(locale);
  preloadFonts(locale);
  return (
    <html lang={locale} dir="ltr">
      <body>
        <CspNonceMeta />
        <DisclosureBehavior />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
