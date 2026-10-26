import { notFound } from "next/navigation";
import { DiscoveryPage } from "@/features/discovery/page";
import { ArchiveScreen } from "@/features/legacy/archive-screen";
import { legacyListingStructuredData } from "@/i18n/structured-data";
import { getLegacyPage } from "@/server/legacy/pages";
import { publicPageMetadata, publicPageUrl } from "@/server/seo/public-metadata";
import { StructuredData } from "@/ui/structured-data";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;
  const page = getLegacyPage(locale, id);
  if (!page) notFound();
  const metadata = await publicPageMetadata({
    locale,
    path: `/legacy/${id}`,
    title: page.title,
    description: page.description ?? undefined,
    availableIn: [page.locale],
  });
  return {
    ...metadata,
    title: page.seoTitle == null ? undefined : { absolute: page.seoTitle },
    description: page.description ?? undefined,
  };
}

/** P21 / F09 / M-072: source preservation and the visitor's archive recovery view. */
export default async function LegacyPage({ params }: Props) {
  const { locale, id } = await params;
  const page = getLegacyPage(locale, id);
  if (!page) notFound();
  const structuredData = page.listing
    ? legacyListingStructuredData(page, await publicPageUrl(page.locale, `/legacy/${page.id}`))
    : null;
  return (
    <DiscoveryPage>
      {structuredData ? <StructuredData value={structuredData} /> : null}
      <ArchiveScreen page={page} />
    </DiscoveryPage>
  );
}
