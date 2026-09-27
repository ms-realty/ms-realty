// P07: current approved data on read, never stale local property facts.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { ListingCard } from "@/features/discovery/listing-card";
import { LocalSelection } from "@/features/discovery/local-selection";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import type { QueryParams } from "@/features/discovery/query";
import { isRoutableLocale } from "@/i18n/config";
import { getPublicListing } from "@/server/listings/detail";
export const metadata = discoveryMetadata;
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale),
    query = await searchParams;
  const refs =
    typeof query.references === "string"
      ? [...new Set(query.references.split(","))].filter((r) => /^MS-\d{5,}$/.test(r)).slice(0, 3)
      : [];
  const results = await Promise.all(
    refs.map(async (reference) => {
      try {
        return { reference, result: await getPublicListing(getDb(), { reference, locale }) };
      } catch {
        return { reference, result: null };
      }
    }),
  );
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.compare}</h1>
      <LocalSelection kind="compare" locale={locale} copy={copy} />
      {results.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {results.map(({ reference, result }) =>
            result?.status === "listing" ? (
              <ListingCard key={reference} listing={result.listing} locale={locale} copy={copy} />
            ) : (
              <div key={reference} className="space-y-3 rounded-control border border-border p-5">
                <h2>
                  <bdi>{reference}</bdi>
                </h2>
                <p>{result ? copy.unavailable : copy.failed}</p>
              </div>
            ),
          )}
        </div>
      ) : null}
      <a className="underline" href={`/${locale}/properties`}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
