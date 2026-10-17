import { notFound } from "next/navigation";
import { discoveryCopy } from "@/features/discovery/copy";
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

export default async function LegacyPage({ params }: Props) {
  const { locale, id } = await params;
  const page = getLegacyPage(locale, id);
  if (!page) notFound();
  const copy = discoveryCopy(page.locale);
  const structuredData = page.listing
    ? legacyListingStructuredData(page, await publicPageUrl(page.locale, `/legacy/${page.id}`))
    : null;
  return (
    <DiscoveryPage>
      {structuredData ? <StructuredData value={structuredData} /> : null}
      <article className="min-w-0 space-y-8 wrap-anywhere" lang={page.locale}>
        <div className="max-w-reading space-y-6">
          <header className="space-y-2">
            <h1 className="text-title font-semibold">{page.title}</h1>
            {page.listing ? (
              <p className="flex flex-wrap gap-x-2 text-dense">
                <span className="text-text-muted">{copy.reference}</span>
                <bdi className="font-semibold">{page.listing.reference}</bdi>
              </p>
            ) : null}
          </header>
          {/* Plain source text cannot execute WordPress scripts, embeds or forms. */}
          <div data-legacy-source-body className="whitespace-pre-wrap text-body">
            {page.bodyText}
          </div>
          {page.contentLinks?.length ? (
            <ul className="flex flex-wrap gap-x-4 text-dense">
              {page.contentLinks.map((link) => (
                <li key={`${link.url}:${link.text}`}>
                  <a
                    className="inline-flex min-h-control items-center underline underline-offset-4"
                    href={link.url}
                  >
                    {link.text}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {page.media.length ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.media.map((photo, index) => (
              <figure key={photo.id}>
                {/* The original public image is preserved uncropped; a fixed 4:3 frame keeps the
                    gallery even and reserves space while its unknown dimensions load. */}
                {/* biome-ignore lint/performance/noImgElement: original photo dimensions are unknown; preserve the source without fabricating dimensions for an optimizer. */}
                <img
                  src={legacyMediaPath(photo.url) ?? photo.url}
                  alt={photo.alt}
                  loading={index ? "lazy" : "eager"}
                  className="aspect-[4/3] h-auto w-full rounded-card bg-subtle object-contain"
                />
              </figure>
            ))}
          </div>
        ) : null}
      </article>
    </DiscoveryPage>
  );
}
