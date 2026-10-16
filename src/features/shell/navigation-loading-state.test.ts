import { expect, it } from "vitest";
import { navigationLoadingTarget } from "./navigation-loading-state";

const origin = "https://makler-realty.test/en";
it("gives public list and listing navigation their shape in all supported directions", () => {
  expect(navigationLoadingTarget("public", "/en/properties", origin)).toEqual({
    locale: "en",
    kind: "list",
  });
  expect(navigationLoadingTarget("public", "/he/properties/MS-00001/property", origin)).toEqual({
    locale: "he",
    kind: "listing",
  });
});
it("gives private list and record reads a shape without a record lookup", () => {
  expect(navigationLoadingTarget("staff", "/ru/inventory", origin)).toEqual({
    locale: "ru",
    kind: "list",
  });
  expect(navigationLoadingTarget("client", "/he/overview/record", origin)).toEqual({
    locale: "he",
    kind: "record",
  });
});
it.each([
  "https://external.test/en/properties",
  "/en#main",
  "/en/inquire",
  "/en/properties/intent",
  "/unsupported/properties",
])("does not treat another kind of public navigation as a list read: %s", (href) => {
  expect(navigationLoadingTarget("public", href, origin)).toBeNull();
});
it("keeps staff locale restrictions and does not replay same-page navigation", () => {
  expect(navigationLoadingTarget("staff", "/he/inventory", origin)).toBeNull();
  expect(
    navigationLoadingTarget("public", "/en/properties#results", `${origin}/properties`),
  ).toBeNull();
});
