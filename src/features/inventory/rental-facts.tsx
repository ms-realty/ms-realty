import { rentalFact, rentalFactKeys } from "@/domain/rental-facts";
import { inventoryCopy, optionLabel } from "./copy";

/** O14/F26 exact listing-revision terms; absence is never shown as zero or an agreed term. */
export function RentalFacts({ terms, locale }: { terms: unknown; locale: string }) {
  if (
    !terms ||
    typeof terms !== "object" ||
    !("purpose" in terms) ||
    terms.purpose !== "long_term_rent"
  )
    return null;
  const copy = inventoryCopy(locale);
  const labels = [
    copy.labels.rentalDeposit,
    copy.labels.rentalCharges,
    copy.labels.rentalAvailableFrom,
    copy.labels.rentalRestrictions,
  ];
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{copy.rentalTitle}</h3>
      <p className="text-dense text-text-muted">{copy.rentalBoundary}</p>
      <dl className="space-y-3">
        {rentalFactKeys.map((key, index) => {
          const fact = rentalFact(terms, key);
          return (
            <div key={key}>
              <dt className="font-semibold">{labels[index]}</dt>
              <dd>
                {optionLabel(fact.state, locale)}
                {fact.readable ? (
                  fact.values.map((value) => (
                    <div key={JSON.stringify(value)} className="whitespace-pre-wrap">
                      {typeof value === "string" ? (
                        <bdi>{value}</bdi>
                      ) : (
                        <>
                          <bdi>
                            {new Intl.NumberFormat(locale, {
                              style: "currency",
                              currency: value.currency,
                            }).format(value.amountMinor / 100)}
                          </bdi>
                          {value.period === "month" ? ` · ${copy.o12.periodMonth}` : ""}
                          {"inclusions" in value && value.inclusions.length ? (
                            <p>{value.inclusions.join(" · ")}</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <p>{copy.rentalUnreadable}</p>
                )}
              </dd>
              {fact.provenance.sourceReference ? (
                <dd className="text-dense text-text-muted">
                  {copy.labels.sourceReference}: <bdi>{fact.provenance.sourceReference}</bdi>
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
