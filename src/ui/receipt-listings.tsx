// The saved subjects of a receipt (P12): one row per item in saved order, a name that links only
// while the subject is verifiably public, and a caption saying when the names were saved.
import { buttonClass } from "./button-class";
import type { ReceiptListings as ReceiptListingsData } from "./form/contract";
import { Notice } from "./notice";

export function ReceiptListings({
  listings,
  headingLevel = 2,
}: {
  listings: ReceiptListingsData;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-label={listings.heading} className="min-w-0 space-y-3">
      <Heading className="text-subheading font-semibold">{listings.heading}</Heading>
      <ul className="min-w-0 space-y-3">
        {listings.items.map((item) => (
          <li
            key={item.reference}
            className="min-w-0 space-y-2 rounded-panel border border-divider p-4 wrap-anywhere"
          >
            <p className="font-semibold">
              {item.href ? (
                <a className="text-action underline" href={item.href} lang={item.nameLang}>
                  <bdi>{item.name}</bdi>
                </a>
              ) : (
                <bdi lang={item.nameLang}>{item.name}</bdi>
              )}
            </p>
            <p className="text-dense text-text-muted">
              <span dir="ltr">{item.referenceLabel}</span>
            </p>
            {item.nameNote ? <p className="text-dense text-text-muted">{item.nameNote}</p> : null}
            {item.warning ? <Notice tone="warning" title={item.warning} /> : null}
            {item.status ? <p className="text-dense text-text-muted">{item.status}</p> : null}
            <a className={buttonClass("tertiary", "max-w-full px-0")} href={item.link.href}>
              {item.link.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-dense text-text-muted">{listings.note}</p>
    </section>
  );
}
