import { describe, expect, it } from "vitest";
import { toolsReturnPath } from "./return-path";

const origin = "https://app.example.test";
const back = (referer: string | null, locale = "en") =>
  toolsReturnPath(referer, origin, locale, `/${locale}/operations`);

describe("X02 Close («Go / BACK»)", () => {
  it("returns to the workspace page the person came from, with its query", () => {
    expect(back(`${origin}/en/cases/abc`)).toBe("/en/cases/abc");
    expect(back(`${origin}/en/tasks?view=mine&page=2`)).toBe("/en/tasks?view=mine&page=2");
    expect(back(`${origin}/ru/operations/keys`, "ru")).toBe("/ru/operations/keys");
  });

  it("falls back to Today for anything else", () => {
    for (const referer of [
      null,
      "",
      "not a url",
      // Another host, including the public and client hosts of the same app.
      "https://example.test/en/cases",
      "https://my.example.test/en/overview",
      // Another locale, the tools page itself and the access pages.
      `${origin}/bg/cases`,
      `${origin}/en/operations`,
      `${origin}/en/access`,
      `${origin}/en/access/reauth?returnTo=%2Fen%2Foperations`,
      `${origin}/en`,
    ])
      expect(back(referer), String(referer)).toBe("/en/today");
  });
});
