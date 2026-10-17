// P08: browser-local references only, with no account or availability promise. Links created
// from them are managed here by this browser's creator cookie, never by a viewing token.
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { discoveryCopy } from "@/features/discovery/copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { SavedProperties } from "@/features/discovery/saved-properties";
import { shareCopy } from "@/features/discovery/share-copy";
import { loadCreatorLinks, shareCreatorFrom } from "@/features/discovery/share-server";
import { SharedLinks } from "@/features/discovery/shared-links";
import { isRoutableLocale } from "@/i18n/config";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { loadSavedProperties } from "./actions";
import { createSavedShare, revokeSavedShare } from "./share-actions";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/saved");
}
export default async function SavedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  // X11M paging: an opaque cursor over this browser's own links; it carries no personal data.
  const { links: page } = await searchParams;
  const cursor = typeof page === "string" && page.length <= 256 ? page : undefined;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  const creator = shareCreatorFrom(await cookies());
  const links = creator ? await loadCreatorLinks(creator, locale, cursor) : null;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.saved}</h1>
      <SavedProperties
        locale={locale}
        copy={copy}
        loadAction={loadSavedProperties.bind(null, locale)}
        share={{
          labels: shareCopy(locale),
          ready: creator !== null,
          entryHref: `/api/public-shares/creator-session?locale=${locale}`,
          action: createSavedShare.bind(null, locale),
          initialState: { operationId: randomUUID(), outcome: { kind: "idle" } },
        }}
      />
      <SharedLinks
        locale={locale}
        copy={copy}
        labels={shareCopy(locale)}
        links={links}
        cursor={cursor}
        revoke={revokeSavedShare.bind(null, locale)}
      />
      <a href={`/${locale}/properties`} className="underline">
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
