// P15: approved geography guides and current eligible inventory; BG remains the source.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { areaCopy } from "@/features/discovery/area-copy";
import { type AreaData, loadAreaData, unavailableAreaData } from "@/features/discovery/area-data";
import { AreaIndex } from "@/features/discovery/area-index";
import { isRoutableLocale } from "@/i18n/config";
import { publicPageMetadata } from "@/server/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  // New interface copy has no human translation/indexing approval.
  const metadata = await publicPageMetadata({
    locale,
    path: "/areas",
    title: areaCopy(locale).title,
    availableIn: [],
  });
  return {
    ...metadata,
    robots: { ...(typeof metadata.robots === "object" ? metadata.robots : {}), index: false },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  let data: AreaData;
  try {
    data = await loadAreaData(getDb(), locale);
  } catch {
    data = unavailableAreaData();
  }
  return <AreaIndex locale={locale} data={data} />;
}
