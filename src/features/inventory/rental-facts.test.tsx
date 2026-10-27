import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RentalFacts } from "./rental-facts";

afterEach(cleanup);

it("O14/F26 displays source terms with unknown charges and exact date rather than confirming availability", () => {
  render(
    <RentalFacts
      locale="en"
      terms={{
        purpose: "long_term_rent",
        facts: {
          "rental.deposit": {
            state: "known",
            value: { amountMinor: 12345, currency: "EUR", period: "total" },
            sourceReference: "synthetic-source",
          },
          "rental.available_from": { state: "known", value: "2030-04-05" },
        },
      }}
    />,
  );
  expect(screen.getByText(/123.45/)).toBeVisible();
  expect(screen.getByText("2030-04-05")).toBeVisible();
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  expect(screen.getByText(/Missing charges are unknown, never zero/)).toBeVisible();
  expect(screen.getByText("synthetic-source")).toBeVisible();
});
