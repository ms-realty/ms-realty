import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PublicShell } from "@/features/shell/public-shell";
import { isRoutableLocale } from "@/i18n/config";

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  return <PublicShell locale={locale}>{children}</PublicShell>;
}
