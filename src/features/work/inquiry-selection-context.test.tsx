import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { InquirySelectionContext } from "./inquiry-selection-context";

afterEach(cleanup);
it("keeps all selection summaries visible and long original descriptions inside initially closed disclosures", async () => {
  const user = userEvent.setup();
  const selection = ["MS-00303", "MS-00101", "MS-00202"].map((reference) => ({
    reference,
    manifestId: `manifest-${reference}`,
    title: `Original ${reference}`,
    description: `Original description ${reference}. ${"Original source detail. ".repeat(150)}`,
    locale: "bg",
    sourceUrl: `https://example.test/bg/properties/${reference}/${reference.toLowerCase()}`,
    price: {
      state: "known",
      value: { amountMinor: 12345600, currency: "EUR", period: "total", basis: "asking" },
    },
    area: { state: "unknown" },
    bedrooms: { state: "known", value: 2 },
    place: { country: "BG", settlement: { name: "Test settlement" }, neighborhood: null },
    availability: { presented: "available", freshness: "fresh" },
    facts: [{ key: "feature.lift", fact: { state: "unknown" } }],
  }));
  render(<InquirySelectionContext context={{ selection }} locale="en" />);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(3);
  items.forEach((item, index) => {
    const snapshot = selection[index];
    expect(snapshot).toBeDefined();
    expect(within(item).getByRole("heading").textContent).toContain(snapshot?.reference ?? "");
    const description = within(item).getByText(
      (_, element) => element?.textContent === snapshot?.description,
    );
    expect(description).toHaveAttribute("lang", "bg");
    const disclosure = description.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(description).not.toBeVisible();
    expect(within(item).getByRole("heading")).toBeVisible();
    expect(within(item).getByText(/€123,456/)).toBeVisible();
    expect(disclosure).toContainElement(within(item).getByText(snapshot?.sourceUrl ?? ""));
    expect(disclosure).toContainElement(within(item).getByText(snapshot?.manifestId ?? ""));
    expect(within(item).getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(item.textContent).toContain("€123,456");
  });
  const first = items[0];
  if (!first) throw new Error("Missing first selected property");
  const disclosure = first.querySelector("details");
  const summary = disclosure?.querySelector("summary");
  if (!summary) throw new Error("Missing snapshot disclosure");
  await user.click(summary);
  expect(disclosure).toHaveAttribute("open");
  expect(
    within(first).getByText((_, element) => element?.textContent === selection[0]?.description),
  ).toBeVisible();
});

it("formats exact source money, periods and area precision without storage keys, and preserves missing states", () => {
  const base = {
    manifestId: "source-manifest",
    title: "Source title",
    description: "Source description",
    locale: "bg",
    sourceUrl: "https://example.test/source",
    place: { country: "BG", settlement: null, neighborhood: null },
    availability: { presented: "available", freshness: "fresh" },
    facts: [],
  };
  const selection = [
    {
      ...base,
      reference: "MS-00101",
      price: {
        state: "known",
        value: { amountMinor: 12345678, currency: "EUR", period: "total", basis: "asking" },
      },
      area: { state: "known", value: { value: 68.123456789, unit: "m2", basis: "living" } },
      bedrooms: { state: "known", value: 0 },
    },
    {
      ...base,
      reference: "MS-00202",
      price: {
        state: "known",
        value: { amountMinor: 95001, currency: "EUR", period: "month", basis: "fixed" },
      },
      area: { state: "unknown" },
      bedrooms: { state: "not_supplied" },
    },
    {
      ...base,
      reference: "MS-00303",
      price: { state: "withheld" },
      area: { state: "conflicting" },
      bedrooms: { state: "unknown" },
    },
  ];
  const rendered = render(<InquirySelectionContext context={{ selection }} locale="en" />);
  const summaries = rendered.container.querySelectorAll("li > dl");
  expect(summaries).toHaveLength(3);
  expect(summaries[0]).toHaveTextContent("€123,456.78 · Total price · Asking price");
  expect(summaries[0]).toHaveTextContent("68.123456789 m² · Living area");
  expect(summaries[0]?.querySelectorAll("dd")[2]).toHaveTextContent(/^0$/);
  expect(summaries[1]).toHaveTextContent("€950.01 per month · Fixed price");
  expect(summaries[1]).toHaveTextContent("Unknown");
  expect(summaries[1]).toHaveTextContent("Not supplied");
  expect(summaries[2]).toHaveTextContent("Withheld");
  expect(summaries[2]).toHaveTextContent("Conflicting");
  expect(summaries[2]).toHaveTextContent("Unknown");
  for (const summary of summaries) {
    expect(summary).toBeVisible();
    expect(summary.textContent).not.toMatch(/\bKnown\b|(?:unit|basis|value):|\bm2\b/);
  }
});
