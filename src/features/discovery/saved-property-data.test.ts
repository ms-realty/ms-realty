import { expect, it } from "vitest";
import { validSavedReferences } from "./saved-property-data";

it("accepts only an explicit bounded set of public references without dropping duplicates or bad entries", () => {
  expect(validSavedReferences(["MS-00004", "MS-00002"])).toBe(true);
  expect(validSavedReferences([])).toBe(true);
  for (const invalid of [
    "MS-00004",
    ["MS-00001", "MS-00001"],
    ["MS-00001", "../../secret"],
    ["MS-00001", 2],
    [`MS-${"1".repeat(100)}`],
    Array.from({ length: 51 }, (_, index) => `MS-${String(index).padStart(5, "0")}`),
  ])
    expect(validSavedReferences(invalid)).toBe(false);
});
