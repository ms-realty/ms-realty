import type { Money } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { formatMoney } from "@/i18n/format";
import { cx } from "./cx";

/** The listing's price fact as stored: integer minor units, shown exactly (never rounded). */
export type Price = Pick<Money, "amountMinor" | "currency">;

export type PriceDisplayProps = {
  /** null when the listing is price on request: never shown as zero. */
  price: Price | null;
  /** Locale used to format the amount. */
  locale: PublicLocale;
  /** e.g. "per month", for rentals. Sale prices have none. */
  periodLabel?: string;
  /** e.g. "VAT included" or "Excludes agency fee". */
  basis?: string;
  /** e.g. "Price on request". */
  onRequestLabel: string;
  size?: "card" | "detail";
  className?: string;
};

export function PriceDisplay({
  price,
  locale,
  periodLabel,
  basis,
  onRequestLabel,
  size = "card",
  className,
}: PriceDisplayProps) {
  const amountClass = size === "detail" ? "text-title" : "text-price";
  return (
    <p className={cx("flex flex-col", className)}>
      {price ? (
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cx(amountClass, "font-bold tabular-nums text-text")}>
            <bdi>{formatMoney(locale, price.amountMinor, price.currency)}</bdi>
          </span>
          {periodLabel ? <span className="text-compact text-text-muted">{periodLabel}</span> : null}
        </span>
      ) : (
        <span
          className={cx(
            size === "detail" ? "text-heading" : "text-subheading",
            "font-semibold text-text",
          )}
        >
          {onRequestLabel}
        </span>
      )}
      {price && basis ? <span className="text-caption text-text-muted">{basis}</span> : null}
    </p>
  );
}
