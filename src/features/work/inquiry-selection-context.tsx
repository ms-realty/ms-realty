import { z } from "zod";
import { areaBases, priceBases, pricePeriods } from "@/domain/facts";
import { currencyCodes, isPublicLocale, type PublicLocale } from "@/domain/ids";
import { compareCopy } from "@/features/discovery/compare-copy";
import { discoveryCopy } from "@/features/discovery/copy";
import { optionLabel } from "@/features/inventory/copy";
import { formatMoney, formatNumber } from "@/i18n/format";
import { workCopy } from "./copy";

const fact = z.object({ state: z.string(), value: z.unknown().optional() });
const snapshotSchema = z.object({
  selection: z.array(
    z.object({
      reference: z.string(),
      manifestId: z.string(),
      locale: z.string(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      sourceUrl: z.string(),
      price: fact,
      area: fact,
      bedrooms: fact,
      place: z.object({
        country: z.string(),
        settlement: z.object({ name: z.string() }).nullable(),
        neighborhood: z.string().nullable(),
      }),
      availability: z.object({ presented: z.string(), freshness: z.string() }),
      facts: z.array(z.object({ key: z.string(), fact })),
    }),
  ),
});

function valueText(value: unknown, locale: string): string {
  if (typeof value === "boolean")
    return locale === "bg"
      ? value
        ? "Да"
        : "Не"
      : locale === "ru"
        ? value
          ? "Да"
          : "Нет"
        : value
          ? "Yes"
          : "No";
  if (typeof value === "number")
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => valueText(item, locale)).join(" · ");
  if (value && typeof value === "object") {
    const money = value as Record<string, unknown>;
    if (
      typeof money.amountMinor === "number" &&
      typeof money.currency === "string" &&
      /^[A-Z]{3}$/.test(money.currency)
    ) {
      return `${new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(money.amountMinor / 100)} · ${optionLabel(String(money.period ?? ""), locale)} · ${optionLabel(String(money.basis ?? ""), locale)}`;
    }
    return Object.entries(value)
      .map(([key, item]) => `${optionLabel(key, locale)}: ${valueText(item, locale)}`)
      .join(" · ");
  }
  return "—";
}

const moneyValue = z.object({
  amountMinor: z.number().int().safe(),
  currency: z.enum(currencyCodes),
  period: z.enum(pricePeriods),
  basis: z.enum(priceBases),
});
const areaValue = z.object({ value: z.number(), unit: z.literal("m2"), basis: z.enum(areaBases) });

function summaryValue(
  kind: "price" | "area" | "bedrooms",
  source: z.infer<typeof fact>,
  locale: PublicLocale,
): string {
  if (source.state !== "known") return optionLabel(source.state, locale);
  const copy = discoveryCopy(locale);
  if (kind === "price") {
    const parsed = moneyValue.safeParse(source.value);
    if (!parsed.success) return copy.unknown;
    const value = parsed.data;
    return `${formatMoney(locale, value.amountMinor, value.currency)}${value.period === "month" ? ` ${copy.perMonth}` : ` · ${compareCopy(locale).total}`} · ${copy[value.basis]}`;
  }
  if (kind === "area") {
    const parsed = areaValue.safeParse(source.value);
    if (!parsed.success) return copy.unknown;
    return `${formatNumber(locale, parsed.data.value, { maximumFractionDigits: 20 })}\u00a0m² · ${optionLabel(parsed.data.basis, locale)}`;
  }
  return typeof source.value === "number"
    ? formatNumber(locale, source.value, { maximumFractionDigits: 20 })
    : copy.unknown;
}

/** Original public snapshots, not a fresh query which could replace what the visitor saw. */
export function InquirySelectionContext({ context, locale }: { context: unknown; locale: string }) {
  const parsed = snapshotSchema.safeParse(context);
  if (!parsed.success || !parsed.data.selection.length) return null;
  const publicLocale = isPublicLocale(locale) ? locale : "bg";
  const copy = discoveryCopy(publicLocale);
  const label =
    locale === "bg"
      ? "Избрани имоти при изпращането"
      : locale === "ru"
        ? "Выбранные объекты при отправке"
        : "Properties selected at submission";
  return (
    <section aria-label={label} className="min-w-0 space-y-4 wrap-anywhere">
      <h3 className="font-semibold">{label}</h3>
      <ol className="space-y-4">
        {parsed.data.selection.map((item) => (
          <li key={item.reference} className="min-w-0 space-y-3 rounded-control bg-subtle p-3">
            <h4 className="font-semibold">
              <bdi>{item.reference}</bdi> · <span lang={item.locale}>{item.title}</span>
            </h4>
            <p>
              {[item.place.country, item.place.settlement?.name, item.place.neighborhood]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>
              {optionLabel(item.availability.presented, locale)} ·{" "}
              {optionLabel(item.availability.freshness, locale)}
            </p>
            <dl className="space-y-2">
              {(
                [
                  ["price", compareCopy(publicLocale).price, item.price],
                  ["area", copy.area, item.area],
                  ["bedrooms", copy.bedrooms, item.bedrooms],
                ] as const
              ).map(([kind, name, value]) => (
                <div key={kind}>
                  <dt className="font-semibold">{name}</dt>
                  <dd>{summaryValue(kind, value, publicLocale)}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary className="cursor-pointer font-semibold">{workCopy(locale).details}</summary>
              <p className="mt-3 whitespace-pre-wrap" lang={item.locale}>
                {item.description}
              </p>
              <dl className="mt-3 space-y-2">
                {item.facts.map((value) => (
                  <div key={value.key}>
                    <dt>{optionLabel(value.key, locale)}</dt>
                    <dd>
                      {optionLabel(value.fact.state, locale)}
                      {value.fact.state === "known"
                        ? ` · ${valueText(value.fact.value, locale)}`
                        : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-caption">
                <bdi>{item.sourceUrl}</bdi>
              </p>
              <p className="text-caption">
                {copy.reference}: <bdi>{item.manifestId}</bdi> · {item.locale.toUpperCase()}
              </p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
