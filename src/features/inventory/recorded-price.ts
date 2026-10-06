// O12: a price the latest revision recorded but the working draft cannot carry as it is
// (another currency, no stated period, or conflicting candidates). It stays visible, and saving
// the draft with an unknown price needs an explicit broker choice; nothing is converted or
// guessed.
type Amount = { amountMinor?: unknown; currency?: unknown; period?: unknown };

export function recordedPrice(
  terms: unknown,
  locale: string,
  periods: { total: string; month: string; none: string },
): string | null {
  const facts = (terms as { facts?: Record<string, { state?: unknown; value?: unknown }> } | null)
    ?.facts;
  const recorded = [facts?.price, facts?.["price.amount_without_period"]].filter(
    (fact) => fact && (fact.state === "known" || fact.state === "conflicting"),
  );
  const amounts = recorded.flatMap(
    (fact) => (Array.isArray(fact?.value) ? fact.value : [fact?.value]) as Amount[],
  );
  const text = amounts
    .filter((amount) => typeof amount?.amountMinor === "number")
    .map((amount) => {
      const currency = typeof amount.currency === "string" ? amount.currency : "";
      const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        (amount.amountMinor as number) / 100,
      );
      const period =
        amount.period === "total"
          ? periods.total
          : amount.period === "month"
            ? periods.month
            : periods.none;
      return `${value} ${currency} · ${period}`.trim();
    });
  return text.length ? text.join(" | ") : null;
}
