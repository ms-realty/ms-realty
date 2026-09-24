import { describe, expect, it } from "vitest";
import { defaultLocale, isPublicLocale, localeDirection } from "./config";

describe("locale config", () => {
  it("keeps Bulgarian as the default source locale", () => {
    expect(defaultLocale).toBe("bg");
  });

  it("recognises only configured public locales", () => {
    expect(isPublicLocale("he")).toBe(true);
    expect(isPublicLocale("fr")).toBe(false);
  });

  it("renders Hebrew right-to-left", () => {
    expect(localeDirection("he")).toBe("rtl");
    expect(localeDirection("bg")).toBe("ltr");
  });
});
