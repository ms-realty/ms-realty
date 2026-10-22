import { expect, it } from "vitest";
import { assistanceCost } from "./cost-label";

it("shows exact micro-unit amounts as USD without rounding a small cost to zero", () => {
  expect(assistanceCost("520", "en")).toBe("US$0.00052");
  expect(assistanceCost("14999", "en")).toBe("US$0.014999");
  expect(assistanceCost("1000000", "en")).toBe("US$1.00");
});
it("retains exact micro-unit precision beyond floating-point integer precision", () => {
  expect(assistanceCost("1000000000000000000520", "en")).toBe("US$1,000,000,000,000,000.00052");
});
it.each(["bg", "ru"])("uses a decimal comma in %s without changing the cost", (locale) => {
  expect(assistanceCost(520, locale)).toContain("0,00052");
});
it.each(["not_a_cost", "-1", 0.1, Number.NaN])("does not invent a USD amount for %s", (value) => {
  expect(assistanceCost(value, "en")).toBe("—");
});
