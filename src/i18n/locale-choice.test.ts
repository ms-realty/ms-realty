import { describe, expect, it } from "vitest";
import { explicitLocaleChoice } from "./locale-choice";

const navigation = () =>
  new Headers({
    "sec-fetch-site": "same-origin",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
  });
describe("explicit locale choice with private sign-in referrer protection", () => {
  it("remembers a same-origin user navigation without sending a private referrer", () => {
    expect(explicitLocaleChoice(navigation(), "/en/access", "staff")).toBe("en");
    expect(explicitLocaleChoice(navigation(), "/ru/access", "client")).toBe("ru");
  });
  it("never converts external or same-site sibling-host links to a choice", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      const headers = navigation();
      headers.set("sec-fetch-site", site);
      expect(explicitLocaleChoice(headers, "/en/access", "staff")).toBeNull();
    }
  });
  it("excludes background, non-document and unsupported staff locale requests", () => {
    const headers = navigation();
    headers.delete("sec-fetch-mode");
    expect(explicitLocaleChoice(headers, "/en/access", "staff")).toBeNull();
    headers.set("sec-fetch-mode", "navigate");
    headers.set("sec-fetch-dest", "empty");
    expect(explicitLocaleChoice(headers, "/en/access", "staff")).toBeNull();
    expect(explicitLocaleChoice(navigation(), "/de/access", "staff")).toBeNull();
  });
  it("keeps public negotiation separate from a referrer-free navigation", () => {
    expect(explicitLocaleChoice(navigation(), "/en", "public")).toBeNull();
    const headers = navigation();
    headers.set("referer", "https://makler-realty.com/bg/search");
    expect(explicitLocaleChoice(headers, "/en/search", "public")).toBe("en");
    expect(explicitLocaleChoice(headers, "/bg/search", "public")).toBeNull();
  });
});
