// Synthetic DOM checks exercise current catalog consumers. Browser layout, live publication
// and human translation approval remain separate checks.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { area as areaFact, known, money } from "@/domain/facts";
import { displayLocale, localeDirection, type PublicLocale, publicLocales } from "@/i18n/config";
import type { ListingCard as Listing } from "@/server/listings/view-models";
import { discoveryCopy } from "./copy";
import { intentCopy } from "./intent-copy";
import { ListingGrid } from "./listing-card";
import { mapCopy } from "./map-copy";
import { readFilters } from "./query";
import { SearchForm } from "./search-form";
import { SearchMap } from "./search-map";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/ai/intent-source", () => ({ intentPlaces: async () => [] }));
vi.mock("./map-renderer", () => ({
  renderMap: (
    _element: unknown,
    _items: unknown,
    _locale: unknown,
    _release: unknown,
    _copy: unknown,
    _onReady: unknown,
    onError: () => void,
  ) => {
    onError();
    return () => {};
  },
}));

afterEach(cleanup);

function listing(locale: PublicLocale): Listing {
  const provenance = { sourceClass: "source_supplied" } as const;
  return {
    reference: "MS-TEST-00042",
    slug: "ms-test-00042",
    manifestId: "10000000-0000-4000-8000-000000000042",
    locale,
    purpose: "sale",
    propertyType: "apartment",
    title: "Synthetic source title",
    price: known(money(123456789, "USD", "total", "asking"), provenance),
    area: known(areaFact(1250.375, "built"), provenance),
    bedrooms: { state: "not_supplied" },
    place: {
      country: "BG",
      district: null,
      municipality: null,
      settlement: null,
      neighborhood: null,
      precision: "region",
    },
    availability: {
      presented: "confirmation_required",
      freshness: "review_due",
      confirmedAt: null,
      primaryAction: "ask_question",
    },
    cover: null,
  };
}

describe.each([...publicLocales])("%s catalogs in current discovery components", (locale) => {
  it("renders native discovery and intent controls while preserving submitted facts", async () => {
    const copy = discoveryCopy(locale);
    const extra = intentCopy(locale);
    const { container } = render(
      await SearchForm({
        locale,
        copy,
        values: readFilters({ minPrice: "1234567.89", currency: "USD", minArea: "1250.375" }),
        filtersOpen: true,
      }),
    );
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", `/${locale}/properties`);
    expect(screen.getByRole("button", { name: copy.search, exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: extra.title, exact: true })).toHaveAttribute(
      "href",
      `/${locale}/properties/intent`,
    );
    expect(
      screen.getByLabelText(`${extra.minimum} · ${extra.amount}`, { exact: true }),
    ).toHaveValue("1234567.89");
    if (!form) throw new Error("Search form missing");
    const data = new FormData(form);
    expect(data.get("minPrice")).toBe("1234567.89");
    expect(data.get("currency")).toBe("USD");
    expect(data.get("minArea")).toBe("1250.375");
  });

  it("renders catalog labels with exact source currency, area precision and absent states", () => {
    const copy = discoveryCopy(locale);
    const source = listing(locale);
    const before = structuredClone(source);
    const { container } = render(
      <section lang={locale} dir={localeDirection(locale)}>
        <ListingGrid items={[source]} locale={locale} copy={copy} />
      </section>,
    );
    const price = new Intl.NumberFormat(displayLocale(locale), {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(1234567.89);
    const area = new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 20 }).format(
      1250.375,
    );
    expect(container.querySelector(".text-price bdi")?.textContent).toBe(
      `${price} · ${copy.asking}`,
    );
    expect(
      screen.getByText(copy.built, { exact: true }).parentElement?.querySelector("dd")?.textContent,
    ).toBe(`${area}\u00a0m²`);
    expect(screen.getByText(copy.not_supplied, { exact: true })).toBeVisible();
    expect(screen.getByText(copy.built, { exact: true })).toBeVisible();
    expect(container.querySelector("bdi")).toHaveTextContent(source.reference);
    expect(screen.getByRole("link", { name: source.title ?? "" })).toHaveAttribute(
      "href",
      `/${locale}/properties/${source.reference}/${source.slug}`,
    );
    expect(source).toEqual(before);
  });

  it.each(["search", "listing"] as const)(
    "keeps %s map precision disclosure and manual recovery",
    async (scope) => {
      const copy = mapCopy(locale, scope);
      const user = userEvent.setup();
      render(
        <SearchMap
          items={[
            {
              reference: "MS-TEST-00042",
              href: "#property-results",
              label: "Synthetic source title",
              point: {
                latitude: 41.57,
                longitude: 23.28,
                level: "district",
                placeId: "synthetic-district",
              },
            },
          ]}
          locale={locale}
          release="synthetic-release"
          copy={copy}
        />,
      );
      await user.click(screen.getByRole("button", { name: copy.show, exact: true }));
      expect(screen.getByText(copy.precision, { exact: true })).toBeVisible();
      expect(await screen.findByRole("status")).toHaveTextContent(copy.error);
      expect(screen.getByRole("button", { name: copy.retry, exact: true })).toBeVisible();
      expect(screen.getByRole("link", { name: copy.list, exact: true })).toHaveAttribute(
        "href",
        "#property-results",
      );
    },
  );
});
