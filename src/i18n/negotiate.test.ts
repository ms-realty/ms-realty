import { describe, expect, it } from "vitest";
import { publicLocales, staffLocales } from "./config";
import { negotiateLocale, parseAcceptLanguage } from "./negotiate";

describe("Accept-Language negotiation (F01, A02)", () => {
  it("orders ranges by quality, then by position, and drops q=0 and wildcards", () => {
    expect(parseAcceptLanguage("de;q=0.5, en-GB, fr;q=0, *;q=0.1, bg;q=0.8")).toEqual([
      "en-gb",
      "bg",
      "de",
    ]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it("matches a regional variant to its language", () => {
    expect(negotiateLocale("en-US,en;q=0.9", publicLocales)).toBe("en");
    expect(negotiateLocale("nl-BE", publicLocales)).toBe("nl");
  });

  it("maps the deprecated Hebrew code", () => {
    expect(negotiateLocale("iw-IL", publicLocales)).toBe("he");
  });

  it("falls through unsupported languages to the next preference", () => {
    expect(negotiateLocale("fr-FR, ru;q=0.7", publicLocales)).toBe("ru");
  });

  it("returns null rather than guessing", () => {
    expect(negotiateLocale("fr, ja", publicLocales)).toBeNull();
    expect(negotiateLocale("", publicLocales)).toBeNull();
    expect(negotiateLocale("de", staffLocales)).toBeNull();
  });
});
