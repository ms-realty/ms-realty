// P09: the recipient's view of a public-facts share. Everything shown is the current public
// projection read on this request; the token only selects which Listings, never who shared them.
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { discoveryCopy } from "./copy";
import { ListingCard } from "./listing-card";
import { DiscoveryPage } from "./page";
import { type ShareCopy, shareCopy } from "./share-copy";
import { type RecipientRead, recipientSummary } from "./share-model";

const closed = {
  expired: ["expiredTitle", "expiredBody"],
  revoked: ["revokedTitle", "revokedBody"],
  unavailable: ["unknownTitle", "unknownBody"],
} as const satisfies Record<string, readonly [keyof ShareCopy, keyof ShareCopy]>;

export function SharedShortlist({
  locale,
  token,
  read,
}: {
  locale: PublicLocale;
  token: string;
  read: RecipientRead;
}) {
  const copy = discoveryCopy(locale);
  const labels = shareCopy(locale);

  if (read.status !== "ready") {
    const [title, body] = closed[read.status];
    // Expired, revoked and unknown links share one safe shape: no creator, no listing facts.
    return (
      <DiscoveryPage>
        <div data-share-status={read.status} className="max-w-reading space-y-5">
          <h1 className="text-title font-semibold">{labels[title]}</h1>
          <Notice tone="info">
            <p>{labels[body]}</p>
            <p className="mt-2">{labels.noCreator}</p>
          </Notice>
          <a
            className={buttonClass("primary", "max-w-full self-start")}
            href={`/${locale}/properties`}
          >
            {copy.search}
          </a>
        </div>
      </DiscoveryPage>
    );
  }

  const summary = recipientSummary(read);
  return (
    <DiscoveryPage>
      <div data-share-status="ready" className="space-y-8">
        <header className="max-w-reading space-y-3">
          <p className="w-fit rounded-control bg-subtle px-2 py-0.5 text-caption font-semibold text-text-muted">
            {labels.badge}
          </p>
          <h1 className="text-title font-semibold">{labels.title}</h1>
          <p>{labels.publicOnly}</p>
          <p className="text-compact text-text-muted">{labels.checked}</p>
          <p className="text-compact">
            {labels.validUntil}:{" "}
            <time dateTime={read.expiresAt} className="font-semibold">
              {formatDateTime(locale, read.expiresAt)}
            </time>
          </p>
        </header>
        {summary.shown > 0 && summary.shown < summary.total ? (
          // Some items may only lack an approved version in this language: offer the source.
          <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="font-semibold">
              {labels.shown}:{" "}
              <bdi>
                {formatNumber(locale, summary.shown)} / {formatNumber(locale, summary.total)}
              </bdi>
            </span>
            {locale !== "bg" ? (
              <a className="underline" href={`/bg/share/${token}`} hrefLang="bg">
                {labels.inBulgarian}
              </a>
            ) : null}
          </p>
        ) : null}
        {summary.none ? (
          <Notice tone="warning" title={labels.allGoneTitle}>
            <p>{labels.allGoneBody}</p>
            {locale !== "bg" ? (
              <p className="mt-2">
                <a className="font-semibold underline" href={`/bg/share/${token}`} hrefLang="bg">
                  {labels.inBulgarian}
                </a>
              </p>
            ) : null}
          </Notice>
        ) : null}
        <ul className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {read.items.map((item) => (
            <li key={item.reference} className="min-w-0">
              {item.status === "public" ? (
                <ListingCard
                  listing={item.card}
                  locale={locale}
                  copy={copy}
                  actions={
                    <a
                      className={buttonClass("secondary", "max-w-full")}
                      href={`/${locale}/inquire?${new URLSearchParams({
                        purpose: "question",
                        reference: item.card.reference,
                        manifest: item.card.manifestId,
                      })}`}
                    >
                      {copy.ask}
                    </a>
                  }
                />
              ) : (
                // A closed or not-public Listing keeps only its reference: no price or media.
                <article
                  data-listing-reference={item.reference}
                  data-unavailable=""
                  aria-label={item.reference}
                  className="min-w-0 space-y-2 rounded-panel border border-dashed border-border bg-surface p-5 wrap-anywhere"
                >
                  <p className="font-semibold">
                    <bdi>{item.reference}</bdi>
                  </p>
                  <p className="text-compact text-text-muted">{labels.unavailableItem}</p>
                </article>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          {summary.compareReferences ? (
            <a
              className={buttonClass("primary", "max-w-full")}
              href={`/${locale}/compare?references=${summary.compareReferences.join(",")}`}
            >
              {labels.compareThese}
            </a>
          ) : null}
          <a className={buttonClass("secondary", "max-w-full")} href={`/${locale}/properties`}>
            {copy.search}
          </a>
        </div>
      </div>
    </DiscoveryPage>
  );
}
