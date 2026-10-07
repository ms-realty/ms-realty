import { describe, expect, it } from "vitest";
import { sofiaInstant } from "../appointments/time";
import { amountToMinor, deadlineInput } from "./terms";

describe("proposal amount and deadline inputs", () => {
  it("parses exact cents without accepting scientific notation or rounded fractions", () => {
    expect(amountToMinor("120000.01")).toBe(12000001);
    expect(amountToMinor("12,5")).toBe(1250);
    for (const value of ["1e3", "10.001", "-20", "", "9,999.00", "9999999999999999"])
      expect(Number.isNaN(amountToMinor(value))).toBe(true);
  });
  it("preserves each explicit Sofia autumn offset when round-tripping a deadline", () => {
    for (const value of ["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]) {
      const date = new Date(value);
      expect(sofiaInstant(deadlineInput(date))?.toISOString()).toBe(value);
    }
  });
});
