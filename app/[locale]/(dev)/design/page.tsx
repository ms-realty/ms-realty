// Design-system specimen (spec §16, §20.1): every component and state in the page locale.
// Development and e2e only: it does not exist unless ENABLE_DESIGN_SPECIMEN=1.
// The locale layout supplies <html lang/dir>, the fonts and the CSP nonce meta.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isPublicLocale } from "@/i18n/config";
import { isDesignSpecimenEnabled } from "@/ui/specimen/enabled";
import { Specimen } from "@/ui/specimen/specimen";

export const metadata: Metadata = {
  title: "Design system specimen",
  robots: { index: false, follow: false },
};

export default async function DesignSpecimenPage({ params }: PageProps<"/[locale]/design">) {
  await connection();
  if (!isDesignSpecimenEnabled()) notFound();
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return <Specimen locale={locale} />;
}
