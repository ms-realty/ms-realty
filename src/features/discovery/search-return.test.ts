import { expect, it } from "vitest";
import { safeSearchReturn } from "./search-return";

it("F02 preserves the originating structured search and selected result without becoming an open redirect", () => {
  const target =
    "/he/properties?q=MS-00001&purpose=long_term_rent&minBeds=2&sort=price_desc&cursor=valid_cursor#property-result-MS-00001";
  expect(safeSearchReturn("he", target)).toBe(target);
  for (const value of [
    "//external.invalid/",
    "/\\external.invalid/",
    "/en/properties",
    "/he/properties?email=person%40example.test",
    "/he/properties?purpose=sale&purpose=long_term_rent",
    "/he/properties#other",
    "/he/properties?cursor=not.a.cursor",
    [target],
  ])
    expect(safeSearchReturn("he", value)).toBeNull();
});
