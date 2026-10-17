import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("keeps a canonical staff path in the same locale", () => {
    expect(safeNext("en", "/en/inventory/MS-1/media")).toBe("/en/inventory/MS-1/media");
    expect(safeNext("en", "/en/inventory/MS-1?tab=review#inventory-review")).toBe(
      "/en/inventory/MS-1?tab=review#inventory-review",
    );
  });
  it("ignores other hosts, other locales, dot segments and odd input", () => {
    for (const value of [
      "https://evil.test/en/x",
      "//evil.test/en/x",
      "/bg/inventory",
      "/en//x",
      "/en/<x>",
      "/en/../bg/inventory",
      "/en/%2e%2e/bg/inventory",
      "/en/%2E%2E/bg",
      "/en/a/..%2fb",
      "/en/./inventory",
      7,
      null,
    ])
      expect(safeNext("en", value)).toBeNull();
  });
});
