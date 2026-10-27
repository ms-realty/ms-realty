import "../../globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { DisclosureBehavior } from "@/features/shell/disclosure-behavior";
import { isStaffLocale, requestPathHeader } from "@/i18n/config";
import { privateRobots } from "@/i18n/seo";
import { privatePageMetadata } from "@/server/seo/private-metadata";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { preloadFonts } from "@/ui/fonts";
import { LiveAnnouncer } from "@/ui/live-announcer";
import { LocaleProvider } from "@/ui/locale-provider";
import { appViewport } from "@/ui/viewport";

// Root layout of the staff host (app.makler-realty.com, §11.1): staff locales bg/en/ru from
// the URL (§03.1). The interface language changes labels and formatting, never data or access.
export const viewport: Viewport = appViewport;

export async function generateMetadata({
  params,
}: Pick<LayoutProps<"/staff/[locale]">, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  return {
    ...(await privatePageMetadata({
      surface: "staff",
      locale,
      path: (await headers()).get(requestPathHeader),
    })),
    icons: { icon: "/brand/logo-ms-realty.png" },
    robots: privateRobots,
  };
}

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
        <LiveAnnouncer />
        <DisclosureBehavior />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
