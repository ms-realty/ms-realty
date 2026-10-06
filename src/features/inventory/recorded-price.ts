// O12: shows the source price evidence the working draft cannot carry (Codex's
// uneditablePriceEvidence: another currency, no stated period, unsupported purpose, or
// conflicting candidates) exactly as recorded. Nothing is converted or guessed; keeping the
// price unknown is the broker's explicit priceDecision on Save.
import type { UneditablePriceEvidence } from "@/server/inventory/working-draft";

type Amount = { amountMinor?: unknown; currency?: unknown; period?: unknown };

export function describePriceEvidence(
  evidence: readonly UneditablePriceEvidence[],
  locale: string,
  labels: { total: string; month: string; none: string; unreadable: string },
): string | null {
  if (!evidence.length) return null;
  const amounts = evidence.flatMap(
    ({ fact }) => (Array.isArray(fact.value) ? fact.value : [fact.value]) as Amount[],
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
          ? labels.total
          : amount.period === "month"
            ? labels.month
            : labels.none;
      return `${value} ${currency} · ${period}`;
    });
  return text.length ? text.join(" | ") : labels.unreadable;
}
