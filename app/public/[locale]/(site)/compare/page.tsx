// P07: current approved data on read, never stale local property facts.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { compareCopy } from "@/features/discovery/compare-copy";
import {
  Comparison,
  ComparisonCorrection,
  comparisonSelection,
} from "@/features/discovery/comparison";
import { discoveryCopy } from "@/features/discovery/copy";
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
  const selection = comparisonSelection(query.references);
  const refs = selection.references;
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
      <h1 className="text-title font-semibold">{compareCopy(locale).title}</h1>
      {selection.correction === null ? (
        <>
          <LocalSelection
            kind="compare"
            locale={locale}
            copy={copy}
            canonicalReferences={typeof query.references === "string" ? refs : undefined}
          />
          <Comparison items={results} locale={locale} copy={copy} />
        </>
      ) : (
        <ComparisonCorrection entries={selection.correction} locale={locale} copy={copy} />
      )}
      <a className="underline" href={`/${locale}/properties`}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
