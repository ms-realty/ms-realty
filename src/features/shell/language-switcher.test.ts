import { describe, expect, it } from "vitest";
import { switchLocalePath } from "./language-switcher";

describe("switchLocalePath (§22 locale switch preserving context)", () => {
  it("replaces only the locale segment", () => {
    expect(switchLocalePath("/bg", "en")).toBe("/en");
    expect(switchLocalePath("/bg/buy/sandanski", "de")).toBe("/de/buy/sandanski");
  });

  it("keeps the query and fragment", () => {
    expect(switchLocalePath("/bg", "en", "?utm_source=x#contact")).toBe("/en?utm_source=x#contact");
    expect(switchLocalePath("/bg/buy", "ru", "?max=100000&type=apartment")).toBe(
      "/ru/buy?max=100000&type=apartment",
    );
  });
});
