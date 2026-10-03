// Client journey shell on the client host (C01–C18). Pages arrive with slice S3.
import { notFound } from "next/navigation";
import { JourneyShell } from "@/features/shell/journey-shell";
import { isRoutableLocale } from "@/i18n/config";

export default async function JourneyLayout({ children, params }: LayoutProps<"/client/[locale]">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  return <JourneyShell locale={locale}>{children}</JourneyShell>;
}
