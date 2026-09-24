// Client journey surface (C01–C18). Pages arrive with slice S3; access control, not robots,
// keeps it private (spec §20.4).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { JourneyShell } from "@/features/shell/journey-shell";
import { isRoutableLocale } from "@/i18n/config";
import { privateRobots } from "@/i18n/seo";

export const metadata: Metadata = { robots: privateRobots };

export default async function JourneyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  return <JourneyShell locale={locale}>{children}</JourneyShell>;
}
