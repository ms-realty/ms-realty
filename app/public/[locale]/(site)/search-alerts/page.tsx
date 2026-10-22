// P10 public entry: search context only. Existing client identity owns verified opt-in.
import { notFound } from "next/navigation";
import { DiscoveryPage } from "@/features/discovery/page";
import { filterUrl, type QueryParams, readFilters } from "@/features/discovery/query";
import { searchAlertCopy, searchAlertCopyLocale } from "@/features/discovery/search-alert-copy";
import { SearchAlertCriteria } from "@/features/discovery/search-alert-criteria";
import { alertSearch } from "@/features/discovery/search-alert-state";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { configuredAlertRule } from "@/server/subscriptions/rule";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/search-alerts");
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = searchAlertCopy(locale),
    query = await searchParams;
  let search: ReturnType<typeof alertSearch> | undefined;
  try {
    search = alertSearch(locale, query);
  } catch {
    /* Invalid criteria remain a correction state. */
  }
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold" lang={searchAlertCopyLocale(locale)} dir="ltr">
        {copy.title}
      </h1>
      {search ? (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <SearchAlertCriteria locale={locale} search={search} />
            <div className="space-y-4" lang={searchAlertCopyLocale(locale)} dir="ltr">
              <p>{copy.lead}</p>
              <p>{copy.accountHint}</p>
              <a
                className={buttonClass()}
                href={new URL(search.clientHref, getEnv().hosts.client).toString()}
              >
                {copy.account}
              </a>
              <a className="block underline" href={search.searchHref}>
                {copy.edit}
              </a>
            </div>
          </div>
          <aside
            className="min-w-0 space-y-5 rounded-panel bg-subtle p-5"
            lang={searchAlertCopyLocale(locale)}
            dir="ltr"
          >
            <Notice tone="info">
              {configuredAlertRule() ? copy.deliveryBoundary : copy.deliveryOff}
            </Notice>
            <p>{copy.manualHint}</p>
            <a className={buttonClass("secondary")} href={`/${locale}/inquire`}>
              {copy.manual}
            </a>
          </aside>
        </div>
      ) : (
        <div className="space-y-4" lang={searchAlertCopyLocale(locale)} dir="ltr">
          <Notice tone="warning" title={copy.check}>
            {copy.invalid}
          </Notice>
          <a className="underline" href={filterUrl(locale, readFilters(query))}>
            {copy.edit}
          </a>
        </div>
      )}
    </DiscoveryPage>
  );
}
