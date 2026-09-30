// P08: browser-local references only, with no account or availability promise.
import { notFound } from "next/navigation";
import { discoveryCopy } from "@/features/discovery/copy";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import { SavedProperties } from "@/features/discovery/saved-properties";
import { isRoutableLocale } from "@/i18n/config";
import { loadSavedProperties } from "./actions";
export const metadata = discoveryMetadata;
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
