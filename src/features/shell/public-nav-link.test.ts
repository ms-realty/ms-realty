import { expect, it } from "vitest";
import { publicPrimaryNav, publicUtilityNav } from "./navigation";
import { publicNavigationCurrent } from "./public-nav-link";

it("P01/P02 marks the validated Buy/Rent purpose independently of unrelated query filters", () => {
  expect(publicNavigationCurrent("/bg/properties", "", "/bg/properties?purpose=sale")).toBe(true);
  expect(
    publicNavigationCurrent(
      "/he/properties",
      "purpose=long_term_rent&minBeds=2",
      "/he/properties?purpose=long_term_rent",
    ),
  ).toBe(true);
  expect(
    publicNavigationCurrent(
      "/he/properties",
      "purpose=long_term_rent",
      "/he/properties?purpose=sale",
    ),
  ).toBe(false);
  expect(
    publicNavigationCurrent("/en/properties", "purpose=invalid", "/en/properties?purpose=sale"),
  ).toBe(false);
  expect(
    publicNavigationCurrent(
      "/en/properties",
      "purpose=sale&purpose=long_term_rent",
      "/en/properties?purpose=sale",
    ),
  ).toBe(false);
  expect(publicNavigationCurrent("/en/contact", "", "/en/contact")).toBe(true);
});
it("P01/P08/P07 nominates one Contact item and working Areas/Saved/Compare destinations", () => {
  const items = [...publicPrimaryNav, ...publicUtilityNav];
  expect(items.filter((item) => item.path === "/contact")).toHaveLength(1);
  for (const path of ["/areas", "/saved", "/compare"])
    expect(items.some((item) => item.path === path)).toBe(true);
});
