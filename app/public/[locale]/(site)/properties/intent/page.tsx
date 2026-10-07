// F02 / F29: deterministic, inspectable proposals. Optional model interpretation is disabled.
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { intentCopy } from "@/features/discovery/intent-copy";
import { criteriaFilters } from "@/features/discovery/intent-query";
import { DiscoveryPage } from "@/features/discovery/page";
import { filterUrl, type QueryParams, searchInput } from "@/features/discovery/query";
import { isRoutableLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { acceptableChips, type Chip, interpretIntent, toSearchCriteria } from "@/server/ai/intent";
import { intentPlaces } from "@/server/ai/intent-source";
import { hashRequest } from "@/server/crypto";
import { normalizeSearch } from "@/server/search/search";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/properties/intent");
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const query = await searchParams;
  const copy = discoveryCopy(locale);
  const extra = intentCopy(locale);
  const raw = typeof query.text === "string" ? query.text : "";
  const text = raw.slice(0, 500);
  const places = await intentPlaces(getDb()).catch(() => null);
  const interpreted = text.trim() && places ? interpretIntent(text, { locale, places }) : null;
  const chips = interpreted
    ? acceptableChips(interpreted).filter((chip) => chip.kind !== "purpose")
    : [];
  const signature = interpreted
    ? hashRequest({
        text,
        locale,
        interpreted,
        names: places?.map((p) => ({ id: p.id, names: p.names })),
      })
    : "";
  const selected = typeof query.selected === "string" ? [query.selected] : (query.selected ?? []);
  let invalid = raw.length > 500 || Array.isArray(query.text);
  let destination: string | null = null;
  if (query.apply === "1") {
    try {
      if (
        invalid ||
        !interpreted ||
        query.source !== signature ||
        !["sale", "long_term_rent"].includes(String(query.purpose)) ||
        selected.some((id) => !chips.some((chip) => chip.id === id))
      )
        throw new Error("Changed interpretation");
      const criteria = toSearchCriteria(interpreted, selected, {
        purpose: query.purpose as "sale" | "long_term_rent",
        includeNeedsConfirmation: query.includeUnconfirmed === "1",
      });
      const filters = criteriaFilters(criteria);
      normalizeSearch(searchInput(locale, filters));
      destination = filterUrl(locale, filters);
    } catch {
      invalid = true;
    }
  }
  if (destination) redirect(destination);
  const label = (chip: Chip) => {
    const range = (unit = 1) =>
      "min" in chip || "max" in chip
        ? `${"min" in chip && chip.min !== undefined ? `≥ ${formatNumber(locale, chip.min / unit)}` : ""} ${"max" in chip && chip.max !== undefined ? `≤ ${formatNumber(locale, chip.max / unit)}` : ""}`.trim()
        : "";
    switch (chip.kind) {
      case "purpose":
        return chip.value === "sale" ? copy.buy : copy.rent;
      case "property_type":
        return copy[chip.value];
      case "place": {
        const place = places?.find((p) => p.id === chip.placeId);
        return `${extra.locations}: ${place?.names[locale === "bg" ? 0 : 1] ?? place?.names[0] ?? copy.failed}`;
      }
      case "price":
        return `${extra.amount}: ${range(100)} ${chip.currency}`;
      case "rooms":
        return `${extra.rooms}: ${range()}`;
      case "bedrooms":
        return `${copy.bedrooms}: ${range()}`;
      case "area":
        return `${copy[chip.basis]}: ${range()} m²`;
      case "feature":
        return `${extra.features}: ${extra[chip.key]}`;
    }
  };
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{extra.title}</h1>
      <p className="max-w-reading">{extra.lead}</p>
      <form
        action={`/${locale}/properties/intent`}
        method="get"
        className="max-w-reading space-y-4"
      >
        <label className="grid gap-2">
          <span className={labelClass}>{extra.title}</span>
          <textarea
            name="text"
            defaultValue={text}
            maxLength={500}
            rows={4}
            required
            className={controlClass}
          />
        </label>
        <button className={buttonClass("primary")} type="submit">
          {extra.review}
        </button>
      </form>
      {invalid ? <Notice tone="warning" title={extra.check} /> : null}
      {!places ? <Notice tone="warning" title={copy.failed} /> : null}
      {interpreted ? (
        <form
          action={`/${locale}/properties/intent`}
          method="get"
          className="max-w-reading space-y-5"
        >
          <input type="hidden" name="text" value={text} />
          <input type="hidden" name="source" value={signature} />
          <input type="hidden" name="apply" value="1" />
          <h2 className="text-subheading font-semibold">{extra.review}</h2>
          <label className="grid gap-2">
            <span>{copy.purpose}</span>
            <select
              required
              name="purpose"
              defaultValue={
                typeof query.purpose === "string"
                  ? query.purpose
                  : (interpreted.purpose?.value ?? "")
              }
              className={controlClass}
            >
              <option value="">{extra.choose}</option>
              <option value="sale">{copy.buy}</option>
              <option value="long_term_rent">{copy.rent}</option>
            </select>
          </label>
          <ul className="space-y-4">
            {chips.map((chip) => (
              <li key={chip.id} className="rounded-control border border-border bg-surface p-4">
                <label className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    name="selected"
                    value={chip.id}
                    defaultChecked={selected.includes(chip.id)}
                    className="mt-1 size-5 shrink-0 accent-action"
                  />
                  <span>
                    <strong>{label(chip)}</strong>
                    <span className="block text-compact text-text-muted">“{chip.evidence}”</span>
                    {chip.kind === "place" && chip.near ? (
                      <span className="block text-compact">{extra.near}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <section className="space-y-2">
            <h3 className="font-semibold">{extra.notApplied}</h3>
            <ul className="list-disc space-y-1 ps-5">
              {[
                ...new Set([
                  ...interpreted.questions.map((q) => q.evidence).filter(Boolean),
                  ...interpreted.preferences.map((p) => p.evidence),
                  ...interpreted.unparsed.map((span) => span.text),
                ]),
              ].map((evidence) => (
                <li key={evidence}>{evidence}</li>
              ))}
            </ul>
          </section>
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              name="includeUnconfirmed"
              value="1"
              defaultChecked={query.includeUnconfirmed === "1"}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.includeUnconfirmed}</span>
          </label>
          <button type="submit" className={buttonClass("primary")}>
            {extra.apply}
          </button>
        </form>
      ) : null}
      <a className="self-start underline" href={`/${locale}/properties`}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
