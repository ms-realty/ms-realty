import { notFound } from "next/navigation";
import { DiscoveryPage } from "@/features/discovery/page";
import { legacyListingStructuredData } from "@/i18n/structured-data";
import { legacyMediaPath } from "@/server/legacy/media";
import { getLegacyPage } from "@/server/legacy/pages";
import { publicPageMetadata, publicPageUrl } from "@/server/seo/public-metadata";
import { StructuredData } from "@/ui/structured-data";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;
  const page = getLegacyPage(locale, id);
  if (!page) notFound();
  return publicPageMetadata({
    locale,
    path: `/legacy/${id}`,
    title: page.title,
    description: page.description ?? undefined,
    availableIn: [page.locale],
  });
}

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
      <article className="min-w-0 space-y-6 [overflow-wrap:anywhere]" lang={page.locale}>
        <h1 className="text-title font-semibold">{page.title}</h1>
        {page.listing ? (
          <p>
            <bdi>{page.listing.reference}</bdi>
          </p>
        ) : null}
        {/* Plain source text cannot execute WordPress scripts, embeds or forms. */}
        <div data-legacy-source-body className="whitespace-pre-wrap text-body leading-relaxed">
          {page.bodyText}
        </div>
        {page.contentLinks?.length ? (
          <ul className="space-y-2">
            {page.contentLinks.map((link) => (
              <li key={`${link.url}:${link.text}`}>
                <a className="underline underline-offset-4" href={link.url}>
                  {link.text}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {page.media.length ? (
          <div className="grid min-w-0 gap-6 sm:grid-cols-2">
            {page.media.map((photo, index) => (
              <figure key={photo.id}>
                {/* The original public image is preserved; load/count parity still requires actual evidence. */}
                {/* biome-ignore lint/performance/noImgElement: original photo dimensions are unknown; preserve the source without fabricating dimensions for an optimizer. */}
                <img
                  src={legacyMediaPath(photo.url) ?? photo.url}
                  alt={photo.alt}
                  loading={index ? "lazy" : "eager"}
                  className="h-auto w-full object-contain"
                />
              </figure>
            ))}
          </div>
        ) : null}
      </article>
    </DiscoveryPage>
  );
}
