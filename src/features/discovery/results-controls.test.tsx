import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { readFilters } from "./query";
import { ResultsSort } from "./results-controls";

afterEach(cleanup);
it("UI14 keeps sort independently editable and preserves typed hard constraints in its native GET", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ResultsSort
      locale="he"
      copy={discoveryCopy("he")}
      values={readFilters({
        purpose: "long_term_rent",
        q: "MS-00001",
        type: "house,apartment",
        minPrice: "250.35",
        currency: "USD",
        minBeds: "2",
        sort: "price_asc",
      })}
    />,
  );
  await user.selectOptions(screen.getByRole("combobox"), "price_desc");
  const form = container.querySelector("form");
  if (!form) throw new Error("Sort form missing");
  expect(form).toHaveAttribute("method", "get");
  expect(form).toHaveAttribute("action", "/he/properties#results-heading");
  expect(Object.fromEntries(new FormData(form))).toMatchObject({
    purpose: "long_term_rent",
    q: "MS-00001",
    type: "house,apartment",
    minPrice: "250.35",
    currency: "USD",
    minBeds: "2",
    sort: "price_desc",
  });
  expect(new FormData(form).has("cursor")).toBe(false);
});
