import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { receiptCheckAttempted } from "./intake";

describe("P12 receiptCheckAttempted", () => {
  it("treats a missing, foreign or mismatched receipt session as not checked", () => {
    expect(receiptCheckAttempted(new AppError("not_found"))).toBe(false);
  });
  it("treats any other failure as an attempted check with an unknown result", () => {
    expect(receiptCheckAttempted(new AppError("unavailable"))).toBe(true);
    expect(receiptCheckAttempted(new Error("connection reset"))).toBe(true);
  });
});
