// Server-rendered review of the exact immutable candidate; never the mutable working draft.
import type { listingRevisions, propertyFacts } from "@/db/schema";
import { termsFacts } from "@/server/publication/presentation";
import { inventoryCopy, optionLabel } from "./copy";
import { evidenceCopy } from "./evidence-copy";

function valueText(value: unknown, locale: string): string {
  if (Array.isArray(value)) return value.map((v) => valueText(v, locale)).join(" / ");
  if (typeof value === "number")
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
  if (typeof value === "string") return value;
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
  if (!value || typeof value !== "object") return "";
  const v = value as Record<string, unknown>;
  if (typeof v.amountMinor === "number")
    return `${new Intl.NumberFormat(locale, { style: "currency", currency: typeof v.currency === "string" ? v.currency : "EUR" }).format(v.amountMinor / 100)} · ${v.period === "total" ? (locale === "bg" ? "Обща цена" : locale === "ru" ? "Полная цена" : "Total price") : optionLabel(String(v.period ?? ""), locale)}`;
  if (typeof v.value === "number")
    return `${valueText(v.value, locale)} ${v.unit === "m2" ? "m²" : String(v.unit ?? "")} · ${optionLabel(String(v.basis ?? ""), locale)}`;
  return [v.country, v.region, v.settlement, v.neighborhood]
    .filter((v) => typeof v === "string")
    .join(" · ");
}
export function FrozenPreview({
  locale,
  reference,
  revision,
  facts,
}: {
  locale: string;
  reference: string;
  revision: typeof listingRevisions.$inferSelect;
  facts: (typeof propertyFacts.$inferSelect)[];
}) {
  const copy = inventoryCopy(locale),
    evidence = evidenceCopy(locale);
  const source = revision.sourceCopy as { text?: { title?: unknown; description?: unknown } };
  const price = termsFacts(revision.terms).price;
  const priceSource = (revision.terms as { facts?: { price?: { sourceReference?: string } } }).facts
    ?.price?.sourceReference;
  return (
    <section className="space-y-3 rounded-panel border border-divider bg-surface p-5">
      <h3 className="font-semibold">
        {evidence.source} · <bdi>{reference}</bdi> · {copy.revision} {revision.revisionNumber}
      </h3>
      <p className="text-compact text-text-muted">{evidence.sourceHint}</p>
      <p className="text-section font-semibold" lang="bg">
        {String(source.text?.title ?? "")}
      </p>
      <p className="whitespace-pre-wrap" lang="bg">
        {String(source.text?.description ?? "")}
      </p>
      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">{copy.labels.price}</dt>
          <dd>
            {optionLabel(price?.state ?? "unknown", locale)} · {valueText(price?.value, locale)}
          </dd>
          <dd className="break-words text-compact text-text-muted">{priceSource}</dd>
        </div>
        {facts.map((f) => (
          <div key={f.id}>
            <dt className="font-semibold">
              {f.fieldKey === "location"
                ? copy.location
                : f.fieldKey.startsWith("area.")
                  ? copy.labels.area
                  : f.fieldKey === "bedrooms"
                    ? copy.labels.bedrooms
                    : f.fieldKey.replaceAll("_", " ")}
            </dt>
            <dd>
              {optionLabel(f.state, locale)}
              {f.value !== null ? ` · ${valueText(f.value, locale)}` : ""}
            </dd>
            <dd className="break-words text-compact text-text-muted">
              {f.sourceReference} · {f.sourceLanguage?.toUpperCase()}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
