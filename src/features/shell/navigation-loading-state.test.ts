import { expect, it } from "vitest";
import { navigationLoadingTarget } from "./navigation-loading-state";

const origin = "https://makler-realty.test/en";
it("gives public list and listing navigation their shape in all supported directions", () => {
  expect(navigationLoadingTarget("public", "/en/properties", origin)).toMatchObject({
    locale: "en",
    kind: "list",
  });
  expect(
    navigationLoadingTarget("public", "/he/properties/MS-00001/property", origin),
  ).toMatchObject({
    locale: "he",
    kind: "listing",
  });
});
it("gives private list and record reads a shape without a record lookup", () => {
  expect(navigationLoadingTarget("staff", "/ru/inventory", origin)).toMatchObject({
    locale: "ru",
    kind: "list",
  });
  expect(navigationLoadingTarget("client", "/he/overview/record", origin)).toMatchObject({
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

it("takes the destination's own frame and heading box, so arriving content does not jump", () => {
  // Kept in step with DiscoveryPage, TodayScreen, InboxScreen, InquiryScreen, CaseDirectoryScreen,
  // WorkflowPage and the inventory pages.
  expect(navigationLoadingTarget("public", "/en/properties", origin)?.shape).toEqual({
    frame: "mx-auto flex max-w-page flex-col gap-8 px-gutter py-8 lg:px-gutter-wide lg:py-12",
    heading: "h-10",
  });
  expect(navigationLoadingTarget("staff", "/en/today", origin)?.shape.frame).toBe(
    "mx-auto flex min-w-0 max-w-page flex-col gap-6 p-gutter sm:gap-8 sm:p-gutter-wide",
  );
  expect(navigationLoadingTarget("staff", "/en/inquiries/record", origin)?.shape.queue).toBe(true);
  expect(navigationLoadingTarget("staff", "/en/cases/record", origin)?.shape).toEqual({
    frame: "mx-auto flex max-w-6xl flex-col gap-8 px-gutter py-6 lg:px-gutter-wide",
    heading: "h-[1.875rem]",
  });
  expect(navigationLoadingTarget("client", "/en/overview", origin)?.shape.heading).toBe(
    "h-[2.125rem] lg:h-10",
  );
});

it("uses the current workflow frame for client pages outside the deal overview", () => {
  for (const path of [
    "/en/proposals",
    "/en/proposals/operations",
    "/en/overview/record/participants",
  ]) {
    expect(navigationLoadingTarget("client", path, origin)?.shape).toEqual({
      frame: "mx-auto flex max-w-6xl flex-col gap-8 px-gutter py-6 lg:px-gutter-wide",
      heading: "h-[1.875rem]",
    });
  }
  expect(navigationLoadingTarget("client", "/en/overview/record", origin)?.shape.heading).toBe(
    "h-[2.125rem] lg:h-10",
  );
});
