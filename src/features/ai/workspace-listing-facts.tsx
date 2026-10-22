import { z } from "zod";
import { areaBases, factStates, priceBases, pricePeriods } from "@/domain/facts";
import type { WorkspaceSource } from "@/domain/generative";
import { currencyCodes } from "@/domain/ids";
import { discoveryCopy } from "@/features/discovery/copy";
import { isPublicLocale } from "@/i18n/config";
import { formatExactArea, formatNumber } from "@/i18n/format";
import { FactList, FactRow } from "@/ui/fact-row";
import { PriceDisplay } from "@/ui/price-display";
import { workspaceCopy } from "./workspace-copy";

const wrapperSchema = z.object({ state: z.enum(factStates), value: z.unknown().optional() });
const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative().safe(),
  currency: z.enum(currencyCodes),
  period: z.enum(pricePeriods),
  basis: z.enum(priceBases),
});
const areaSchema = z.object({
  value: z.number().positive().finite(),
  unit: z.literal("m2"),
  basis: z.enum(areaBases),
});
const placeName = z
  .object({ name: z.string().min(1).max(200) })
  .nullable()
  .optional();
const placeSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  neighborhood: z.string().max(200).nullable().optional(),
  settlement: placeName,
  municipality: placeName,
  district: placeName,
});
function readJson(value: string | undefined): unknown {
  if (!value || value.length > 12_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function sourceFact(value: string | undefined) {
  const result = wrapperSchema.safeParse(readJson(value));
  return result.success ? result.data : { state: "unknown" as const };
}
function sourceUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

/** Only the server's approved listing projection reaches this renderer. Model prose is never parsed as facts. */
export function WorkspaceListingFacts({
  locale,
  source,
}: {
  locale: string;
  source: WorkspaceSource;
}) {
  if (source.type !== "listing" || source.audience !== "approved_public") return null;
  const language = isPublicLocale(locale) ? locale : "bg",
    copy = workspaceCopy(locale),
    facts = copy.listingFacts,
    labels = discoveryCopy(language);
  const price = sourceFact(source.facts.price),
    area = sourceFact(source.facts.area),
    bedrooms = sourceFact(source.facts.bedrooms);
  const money = moneySchema.safeParse(price.state === "known" ? price.value : null);
  const size = areaSchema.safeParse(area.state === "known" ? area.value : null);
  const count = z
    .number()
    .int()
    .nonnegative()
    .safe()
    .safeParse(bedrooms.state === "known" ? bedrooms.value : null);
  const place = placeSchema.safeParse(readJson(source.facts.location));
  const names = place.success
    ? [
        place.data.neighborhood,
        place.data.settlement?.name,
        place.data.municipality?.name ?? place.data.district?.name,
      ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
    : [];
  const location = names.length
    ? names.join(", ")
    : place.success
      ? (new Intl.DisplayNames([language], { type: "region" }).of(place.data.country) ??
        place.data.country)
      : undefined;
  const href = sourceUrl(source.facts.sourceUrl);
  return (
    <section aria-label={facts.title} className="space-y-3">
      <h4 className="font-semibold">{facts.title}</h4>
      <FactList>
        <FactRow
          label={facts.reference}
          value={source.facts.reference}
          unknownLabel={labels.unknown}
        />
        <div className="space-y-1 py-3">
          <dt className="text-compact text-text-muted">{facts.price}</dt>
          <dd>
            <PriceDisplay
              price={money.success ? money.data : null}
              locale={language}
              periodLabel={
                money.success && money.data.period === "month" ? labels.perMonth : undefined
              }
              basis={money.success ? labels[money.data.basis] : undefined}
              onRequestLabel={price.state === "known" ? labels.unknown : labels[price.state]}
            />
          </dd>
        </div>
        <FactRow
          label={facts.area}
          value={size.success ? formatExactArea(language, size.data.value) : undefined}
          basis={size.success ? labels[size.data.basis] : undefined}
          unknownLabel={area.state === "known" ? labels.unknown : labels[area.state]}
        />
        <FactRow
          label={facts.bedrooms}
          value={count.success ? formatNumber(language, count.data) : undefined}
          unknownLabel={bedrooms.state === "known" ? labels.unknown : labels[bedrooms.state]}
        />
        <FactRow label={facts.location} value={location} unknownLabel={labels.unknown} />
      </FactList>
      {href ? (
        <div className="space-y-1">
          <p className="text-compact font-semibold">{facts.source}</p>
          <a
            href={href}
            className="break-all text-compact font-semibold text-accent underline underline-offset-4"
          >
            {href}
          </a>
        </div>
      ) : null}
    </section>
  );
}
