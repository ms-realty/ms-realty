import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { ContentReference } from "@/domain/inquiry-content";
import { ContentBodyView } from "@/features/content/body";
import { ContentPlaintext } from "@/features/content/plaintext";
import { serviceCopy } from "@/features/service-intake/copy";
import { isRoutableLocale, localeDirection } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { publicServiceOfferings } from "@/server/service-intake/scope";
import { Notice } from "@/ui/notice";
import { contentFallbackTitle, contentLabels } from "./content-copy";
import { readApprovedContent } from "./content-source";
import { discoveryCopy } from "./copy";
import { DiscoveryPage } from "./page";

export async function ContentScreen({
  locale,
  kind,
  slug,
  route,
  intent,
}: {
  locale: string;
  kind: "area" | "service" | "help";
  slug: string;
  route: string;
  intent?: "seller_consultation" | "landlord_consultation";
}) {
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale),
    label = contentLabels(locale);
  let failed = false;
  const bounded = kind === "service" && !intent;
  const offerings = bounded
    ? await publicServiceOfferings(getDb(), slug, locale).catch(() => [])
    : [];
  const content =
    bounded && !offerings.length
      ? null
      : await readApprovedContent(getDb(), kind, slug, locale).catch(() => {
          failed = true;
          return null;
        });
  const source =
    !bounded && !failed && !content && locale !== "bg"
      ? await readApprovedContent(getDb(), kind, slug, "bg").catch(() => null)
      : null;
  const title = content?.title ?? contentFallbackTitle(locale, { kind, route, intent });
  const inquiryQuery = new URLSearchParams();
  if (intent) inquiryQuery.set("purpose", intent);
  if (content)
    inquiryQuery.set(
      "contentReference",
      JSON.stringify({ kind, slug, versionId: content.version.id } satisfies ContentReference),
    );
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">
        <ContentPlaintext text={title} />
      </h1>
      {content ? (
        <article
          lang={content.locale}
          dir={localeDirection(content.locale)}
          className="max-w-reading space-y-5"
        >
          <ContentBodyView body={content} />
          <dl className="space-y-2 border-t border-border pt-4 text-compact">
            <div>
              <dt>{label.scope}</dt>
              <dd lang="bg" dir="ltr">
                {content.reviewScope} · {content.jurisdiction}
              </dd>
            </div>
            <div>
              <dt>{copy.confirmedAt}</dt>
              <dd>
                <time dateTime={content.reviewedAt}>
                  {formatDateTime(locale, content.reviewedAt)}
                </time>
              </dd>
            </div>
          </dl>
        </article>
      ) : (
        <Notice
          tone={failed ? "warning" : "info"}
          title={failed ? copy.failed : label.unavailable}
        />
      )}
      {source ? (
        <a className="self-start underline" href={`/bg${route}`} hrefLang="bg">
          {copy.contentSource}
        </a>
      ) : null}
      {kind === "area" && content?.placeId ? (
        <a
          className="self-start underline"
          href={`/${locale}/properties?${new URLSearchParams({ places: content.placeId })}`}
        >
          {copy.search}
        </a>
      ) : null}
      {offerings.length ? (
        <section className="min-w-0 space-y-3">
          <p>{serviceCopy(locale).boundary}</p>
          {offerings.map((offering) => {
            const query = new URLSearchParams({
              purpose: "service_consultation",
              contentReference: JSON.stringify(offering.contentReference),
              serviceScope: JSON.stringify({
                topic: offering.topic,
                regionId: offering.regionId,
                scopeVersionId: offering.scopeVersionId,
              }),
            });
            return (
              <a
                className="block min-h-control underline"
                key={`${offering.topic}:${offering.regionId}`}
                href={`/${locale}/inquire?${query}`}
              >
                {serviceCopy(locale)[offering.topic]} · {offering.regionName}
              </a>
            );
          })}
        </section>
      ) : null}
      <a
        className="self-start underline"
        href={`/${locale}/inquire${inquiryQuery.size ? `?${inquiryQuery}` : ""}`}
      >
        {copy.ask}
      </a>
    </DiscoveryPage>
  );
}
