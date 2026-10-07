// P15: exact approved place guide, current inventory and a contextual inquiry.
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { loadAreaGuide, loadAreaInventory } from "@/features/discovery/area-data";
import { AreaDetail } from "@/features/discovery/area-detail";
import { isRoutableLocale, type PublicLocale } from "@/i18n/config";
import { publicPageMetadata } from "@/server/seo/public-metadata";

// Metadata and the page use the same observed approved edition and failure decision.
const readPageGuide = cache(async (locale: PublicLocale, slug: string) => {
  try {
    return await loadAreaGuide(getDb(), locale, slug);
  } catch {
    return { area: null, sourceAvailable: false, failed: true };
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isRoutableLocale(locale) || !/^[a-z\d][a-z\d-]{0,100}$/.test(slug)) notFound();
  const { area: content, sourceAvailable, failed } = await readPageGuide(locale, slug);
  if (!content && !sourceAvailable && !failed) notFound();
  const metadata = await publicPageMetadata({
    locale,
    path: `/areas/${slug}`,
    title: content?.title,
    description: content?.paragraphs.join(" "),
    availableIn: content ? [locale] : [],
  });
  return content
    ? metadata
    : {
        ...metadata,
        robots: { ...(typeof metadata.robots === "object" ? metadata.robots : {}), index: false },
      };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isRoutableLocale(locale) || !/^[a-z\d][a-z\d-]{0,100}$/.test(slug)) notFound();
  const { area, failed, sourceAvailable } = await readPageGuide(locale, slug);
  if (!area && !sourceAvailable && !failed) notFound();
  let inventory = null;
  if (area) inventory = await loadAreaInventory(getDb(), locale, area.geography[0]?.id ?? null);
  return (
    <AreaDetail
      locale={locale}
      area={area}
      inventory={inventory}
      sourceAvailable={sourceAvailable}
      failed={failed}
      slug={slug}
    />
  );
}
