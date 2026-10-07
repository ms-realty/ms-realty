import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSearch } from "@/server/search/search";
import { discoveryCopy } from "./copy";
import { readFilters, searchInput } from "./query";
import { SearchForm } from "./search-form";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/ai/intent-source", () => ({
  intentPlaces: async () => [
    { id: "place-a", names: ["Сандански", "Sandanski"] },
    { id: "place-b", names: ["Поленица", "Polenitsa"] },
  ],
}));

afterEach(cleanup);

function submittedFilters(form: HTMLFormElement) {
  const submitted = new URLSearchParams(
    [...new FormData(form)].map(([name, value]) => [name, String(value)]),
  );
  return readFilters(
    Object.fromEntries(
      [...new Set(submitted.keys())].map((key) => [
        key,
        submitted.getAll(key).length > 1 ? submitted.getAll(key) : (submitted.get(key) ?? ""),
      ]),
    ),
  );
}

describe("P02 native advanced filters", () => {
  it("offers only area bases carried by the search projection", async () => {
    render(
      await SearchForm({
        locale: "en",
        copy: discoveryCopy("en"),
        values: readFilters({}),
        filtersOpen: true,
      }),
    );
    const basis = screen.getByLabelText<HTMLSelectElement>("Area basis");
    expect([...basis.options].map((option) => option.value)).toEqual([
      "living",
      "built",
      "total",
      "land",
    ]);
    for (const option of basis.options) {
      expect(() =>
        normalizeSearch(searchInput("en", readFilters({ areaBasis: option.value, minArea: "55" }))),
      ).not.toThrow();
    }
  });

  it.each(["usable", "gross_floor"])(
    "retains unsupported selected basis %s until the visitor corrects it",
    async (areaBasis) => {
      const user = userEvent.setup();
      const values = readFilters({ areaBasis, minArea: "55" });
      const { container } = render(
        await SearchForm({ locale: "en", copy: discoveryCopy("en"), values, filtersOpen: true }),
      );
      const basis = screen.getByLabelText<HTMLSelectElement>("Area basis");
      const form = container.querySelector("form");
      if (!form) throw new Error("Search form missing");
      expect(basis).toBeVisible();
      expect(basis).toHaveValue(areaBasis);
      expect([...basis.selectedOptions].map((option) => option.textContent)).toEqual([
        discoveryCopy("en")[areaBasis as "usable" | "gross_floor"],
      ]);
      expect(submittedFilters(form)).toMatchObject({ areaBasis, minArea: "55" });
      expect(() => normalizeSearch(searchInput("en", submittedFilters(form)))).toThrow();
      await user.selectOptions(basis, "built");
      expect(submittedFilters(form)).toMatchObject({ areaBasis: "built", minArea: "55" });
      expect(() => normalizeSearch(searchInput("en", submittedFilters(form)))).not.toThrow();
    },
  );

  it("starts compact and exposes editable controls through the native disclosure", async () => {
    const user = userEvent.setup();
    const { container } = render(
      await SearchForm({ locale: "en", copy: discoveryCopy("en"), values: readFilters({}) }),
    );
    const disclosure = container.querySelector("details");
    expect(disclosure).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByLabelText("Minimum bedrooms", { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: "Describe your search" })).toHaveAttribute(
      "href",
      "/en/properties/intent",
    );
    await user.click(screen.getByRole("checkbox", { name: "Apartment" }));
    await user.type(screen.getByLabelText("Minimum bedrooms", { exact: true }), "2");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const form = container.querySelector("form");
    if (!form) throw new Error("Search form missing");
    expect(disclosure).not.toHaveAttribute("open");
    expect(submittedFilters(form)).toMatchObject({ type: "apartment", minBeds: "2" });
  });

  it("submits every selected rule from closed advanced fields without JavaScript", async () => {
    const values = readFilters({
      q: "MS-202",
      purpose: "long_term_rent",
      type: ["apartment", "house"],
      minPrice: "250.35",
      maxPrice: "900",
      currency: "USD",
      minBeds: "2",
      maxBeds: "3",
      minRooms: "3",
      maxRooms: "5",
      places: ["place-a", "place-b", "unavailable-place"],
      features: ["parking", "source-feature"],
      areaBasis: "built",
      minArea: "42.75",
      maxArea: "100",
      sort: "price_desc",
      includeUnconfirmed: "1",
    });
    const { container } = render(
      await SearchForm({ locale: "en", copy: discoveryCopy("en"), values }),
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Search form missing");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/en/properties");
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(submittedFilters(form)).toEqual(values);
    expect(screen.getByLabelText("Active filters")).toHaveTextContent("Built area");
    expect(screen.getByLabelText("Active filters")).toHaveTextContent("Sandanski");
  });

  it("resets through a clean GET URL without carrying rules or a pagination cursor", async () => {
    const { unmount } = render(
      await SearchForm({
        locale: "he",
        copy: discoveryCopy("he"),
        values: readFilters({ minBeds: "2", type: "house", q: "MS-202", sort: "newest" }),
      }),
    );
    const href = screen.getByRole("link", { name: discoveryCopy("he").clear }).getAttribute("href");
    expect(href).toBe("/he/properties");
    const reset = readFilters(
      Object.fromEntries(new URL(href ?? "", "https://example.test").searchParams),
    );
    unmount();
    const { container } = render(
      await SearchForm({ locale: "he", copy: discoveryCopy("he"), values: reset }),
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Search form missing");
    expect(searchInput("he", submittedFilters(form))).toEqual({
      locale: "he",
      purpose: "sale",
      q: "",
      sort: "relevance",
      includeUnconfirmed: false,
    });
  });

  it("retains unit preferences without claiming an unapplied price or area filter", async () => {
    const values = readFilters({ currency: "USD", areaBasis: "gross_floor" });
    const { container } = render(
      await SearchForm({ locale: "en", copy: discoveryCopy("en"), values }),
    );
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
    const form = container.querySelector("form");
    if (!form) throw new Error("Search form missing");
    const submitted = submittedFilters(form);
    expect(submitted).toMatchObject({ currency: "USD", areaBasis: "gross_floor" });
    expect(searchInput("en", submitted)).not.toHaveProperty("price");
    expect(searchInput("en", submitted)).not.toHaveProperty("area");
  });

  it("opens correction fields and retains rejected values instead of silently relaxing them", async () => {
    const values = readFilters({
      minPrice: "-10",
      type: "unknown-type",
      currency: "XYZ",
      areaBasis: "unrecognized",
    });
    const { container } = render(
      await SearchForm({ locale: "bg", copy: discoveryCopy("bg"), values, filtersOpen: true }),
    );
    expect(container.querySelector("details")).toHaveAttribute("open");
    const form = container.querySelector("form");
    if (!form) throw new Error("Search form missing");
    const submitted = submittedFilters(form);
    for (const key of ["minPrice", "type", "currency", "areaBasis"] as const)
      expect(submitted[key]).toBe(values[key]);
  });
});
