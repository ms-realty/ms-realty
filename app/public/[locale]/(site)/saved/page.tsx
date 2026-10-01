// P08: browser-local references only, with no account or availability promise.
import { notFound } from "next/navigation";
import { discoveryCopy } from "@/features/discovery/copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { SavedProperties } from "@/features/discovery/saved-properties";
import { isRoutableLocale } from "@/i18n/config";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { loadSavedProperties } from "./actions";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/saved");
}
export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.saved}</h1>
      <SavedProperties
        locale={locale}
        copy={copy}
        loadAction={loadSavedProperties.bind(null, locale)}
      />
      <a href={`/${locale}/properties`} className="underline">
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
