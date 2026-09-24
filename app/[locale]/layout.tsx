import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isPublicLocale, localeDirection } from "@/i18n/config";
import "../globals.css";

export const metadata: Metadata = {
  title: "MS Realty",
  icons: { icon: "/brand/favicon.svg" },
  // Nothing is human-approved for indexing yet (spec §20.4).
  robots: { index: false, follow: false },
};

export default async function PublicRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Dynamic rendering is required for the per-request CSP nonce.
  await connection();
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
