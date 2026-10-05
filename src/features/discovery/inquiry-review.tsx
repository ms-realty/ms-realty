import { localeEndonyms, type PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import { ApprovedMedia } from "./approved-media";
import type { DiscoveryCopy } from "./copy";
import { OwnerInquirySummary } from "./inquiry-owner";
import { inquiryReviewCopy } from "./inquiry-review-copy";
import type { InquiryState, InquiryValues } from "./inquiry-state";
import { ViewingPreferenceSummary } from "./inquiry-viewing";
import { ListingFacts } from "./listing-card";
import { listingHref, locality, priceText } from "./presentation";

export function InquiryReview({
  review,
  values,
  locale,
  copy,
  pending,
}: {
  review: NonNullable<InquiryState["review"]>;
  values: InquiryValues;
  locale: PublicLocale;
  copy: DiscoveryCopy;
  pending: boolean;
}) {
  const c = inquiryReviewCopy(locale);
  const purpose = {
    question: copy.ask,
    callback: copy.callback,
    seller_consultation: copy.sell,
    landlord_consultation: copy.let,
    viewing_request: copy.viewing,
    service_consultation: c.service,
  }[values.purpose];
  const rows = [
    [c.recipient, "MS Realty"],
    [copy.purpose, purpose],
    [c.language, localeEndonyms[locale]],
    [copy.name, values.name],
    [copy.contactMethod, values.contactKind === "phone" ? copy.phone : copy.email],
    [values.contactKind === "phone" ? copy.phone : copy.email, values.contactValue],
    [copy.callbackWindow, values.callbackWindow],
    [copy.message, values.message],
  ];
  return (
    <section className="min-w-0 max-w-reading space-y-6 wrap-anywhere" aria-label={c.reviewTitle}>
      <header className="space-y-3">
        <h2 className="font-display text-heading font-semibold">{c.reviewTitle}</h2>
        <p>{c.reviewNote}</p>
      </header>
      <input type="hidden" name="inquiryStage" value="confirm" />
      <input type="hidden" name="reviewToken" value={review.token} />
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {review.content ? (
        <section
          className="space-y-2 rounded-panel border border-divider p-4"
          aria-label={copy.source}
        >
          <h3 className="font-semibold">
            <a href={review.content.sourceUrl} className="underline" lang={review.content.locale}>
              {review.content.title}
            </a>
          </h3>
          <p className="text-dense text-text-muted">{localeEndonyms[review.content.locale]}</p>
        </section>
      ) : null}
      {review.listings.length ? (
        <ol className="space-y-5" aria-label={copy.properties}>
          {review.listings.map((listing) => (
            <li
              key={listing.reference}
              className="space-y-4 rounded-panel border border-divider p-4"
              data-review-listing={listing.reference}
            >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <ApprovedMedia media={listing.cover} unavailable={copy.noPhoto} />
                <div className="min-w-0 space-y-3">
                  <p className="text-dense text-text-muted">
                    <bdi>{listing.reference}</bdi>
                  </p>
                  <h3 className="font-semibold">
                    <a className="underline" href={listingHref(listing, locale)}>
                      {listing.title || listing.reference}
                    </a>
                  </h3>
                  <p>{locality(listing)}</p>
                  <p className="font-semibold">{priceText(listing.price, locale, copy)}</p>
                  <ListingFacts listing={listing} locale={locale} copy={copy} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {review.viewingPreferences ? (
        <ViewingPreferenceSummary input={review.viewingPreferences} locale={locale} />
      ) : null}
      {review.ownerInput ? <OwnerInquirySummary input={review.ownerInput} locale={locale} /> : null}
      <dl className="space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-dense text-text-muted">{label}</dt>
            <dd className="whitespace-pre-wrap">{value || c.notProvided}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-control bg-subtle p-4">{copy.privacy}</p>
      <p className="text-dense text-text-muted">{copy.next}</p>
      <button
        type="submit"
        name="editInquiry"
        value="1"
        formNoValidate
        disabled={pending}
        className={buttonClass("secondary")}
      >
        {c.editAction}
      </button>
    </section>
  );
}
