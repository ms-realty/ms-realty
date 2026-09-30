import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SearchEditor } from "./screens";

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
    name: "Property purpose",
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
