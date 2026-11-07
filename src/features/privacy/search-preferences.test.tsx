import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SearchEditor, SearchSummary } from "./screens";
import { searchSummary } from "./search-summary";

afterEach(cleanup);
it("native editing keeps the stored rental selected and targets its existing stream", () => {
  render(
    <SearchEditor
      locale="en"
      termsVersionId="terms"
      subscription={{
        id: "existing-rental",
        version: 3,
        purpose: "search_alerts",
        state: "paused",
        frequency: "weekly",
        timezone: "Europe/Sofia",
        criteriaSummary: "Synthetic rental",
        criteria: {
          locale: "en",
          q: "Existing rental",
          criteria: {
            purpose: "long_term_rent",
            price: { currency: "EUR", min: 95003, max: 150007 },
          },
        },
      }}
    />,
  );
  const disclosure = screen.getByText("Edit saved search").closest("details");
  if (!disclosure) throw new Error("Missing search editor");
  const field = within(disclosure).getByRole("combobox", {
    name: "Buy or rent",
    hidden: true,
  });
  expect(field).toHaveValue("long_term_rent");
  const form = field.closest("form");
  if (!form) throw new Error("Missing native edit form");
  const data = new FormData(form);
  expect(data.get("intent")).toBe("edit_search");
  expect(data.get("id")).toBe("existing-rental");
  expect(data.get("searchPurpose")).toBe("long_term_rent");
  expect(data.get("maxPrice")).toBe("1500.07");
  const price = within(disclosure).getByRole("spinbutton", {
    name: "Maximum price in EUR (optional)",
    hidden: true,
  });
  expect(price).toHaveAttribute("step", "0.01");
  expect(price).toBeValid();
  for (const option of screen.getAllByRole("option", { name: "Rent", hidden: true }))
    expect(option).toHaveValue("long_term_rent");
});

const summaryLanguages = [
  ["bg", "Покупка", "Наем"],
  ["en", "Buy", "Rent"],
  ["ru", "Купить", "Арендовать"],
  ["de", "Kaufen", "Mieten"],
  ["nl", "Kopen", "Huren"],
  ["el", "Αγορά", "Ενοικίαση"],
  ["he", "קנייה", "שכירות"],
] as const;

it.each(summaryLanguages)(
  "C11 renders generated saved-search labels in %s while preserving exact query, currency and bounds",
  (locale, sale, rent) => {
    for (const purpose of ["sale", "long_term_rent"] as const) {
      const query = "Exact source query / MS-00123 / София / תל אביב";
      const criteria = {
        locale,
        q: query,
        criteria: { purpose, price: { currency: "GBP" as const, min: 95003, max: 150007 } },
      };
      const label = purpose === "sale" ? sale : rent;
      const before = JSON.stringify(criteria);
      expect(searchSummary(criteria)).toBe(`${label} · ${query} · GBP 950.03 – 1500.07`);
      const { container, unmount } = render(
        <SearchSummary
          locale={locale}
          subscription={{
            purpose: "search_alerts",
            criteria,
            criteriaSummary: `${locale === "bg" ? label : purpose === "sale" ? "Buy" : "Rent"} · ${query} · GBP 950.03 – 1500.07`,
          }}
        />,
      );
      expect(container.textContent).toBe(`${label} · ${query} · GBP 950.03 – 1500.07`);
      expect(screen.getByText(query).tagName).toBe("BDI");
      expect(screen.getByText("GBP 950.03 – 1500.07")).toHaveAttribute("dir", "ltr");
      expect(JSON.stringify(criteria)).toBe(before);
      unmount();
    }
  },
);

it("C11 follows the current interface locale for a recognized saved summary without changing stored prose", () => {
  const criteria = {
    locale: "bg" as const,
    q: "Exact source query",
    criteria: { purpose: "sale" as const },
  };
  const stored = searchSummary(criteria);
  const { container } = render(
    <SearchSummary
      locale="ru"
      subscription={{ purpose: "search_alerts", criteria, criteriaSummary: stored }}
    />,
  );
  expect(container.textContent).toBe("Купить · Exact source query");
  expect(stored).toBe("Покупка · Exact source query");
});

it.each([
  { locale: "ru", q: "Exact query", criteria: { purpose: "sale" } },
  { locale: "ru", q: "Exact query", criteria: { purpose: "future_purpose" } },
  {
    locale: "ru",
    q: "Exact query",
    criteria: { purpose: "sale", price: { currency: "unknown", max: 12345 } },
  },
  null,
])("C11 leaves unrecognized historical summary and criteria untouched", (criteria) => {
  const historical = "Rent · historical source prose / EUR 1.2345 / מחרוזת מקור";
  const before = JSON.stringify(criteria);
  const { container } = render(
    <SearchSummary
      locale="he"
      subscription={{ purpose: "search_alerts", criteria, criteriaSummary: historical }}
    />,
  );
  expect(container.textContent).toBe(historical);
  expect(JSON.stringify(criteria)).toBe(before);
});

it("C11 preserves open price bounds without inventing a saved maximum", () => {
  const criteria = {
    locale: "de" as const,
    q: null,
    criteria: { purpose: "sale" as const, price: { currency: "USD" as const, min: 12345 } },
  };
  const stored = searchSummary(criteria);
  const { container } = render(
    <SearchSummary
      locale="he"
      subscription={{ purpose: "search_alerts", criteria, criteriaSummary: stored }}
    />,
  );
  expect(container.textContent).toBe("קנייה · USD 123.45 – ∞");
  expect(stored).toBe("Kaufen · USD 123.45 – ∞");
});
