import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  areaBases,
  factStates,
  listingPurposes,
  priceBases,
  propertyTypes,
  sourceClasses,
} from "@/domain/facts";
import { commercialStates, editorialStates } from "@/domain/listing";
import { pointerStates } from "@/domain/publication";
import { optionLabel } from "@/features/inventory/copy";
import { publicLocales, staffLocales } from "./config";
import { factFieldLabel } from "./fact-labels";
import { workflowLabel } from "./workflow-labels";

it.each(publicLocales)("labels the service consultation case type in %s", (locale) => {
  expect(workflowLabel("service_intake", locale)).not.toContain("service_intake");
  expect(workflowLabel("service_intake", locale)).not.toBe(workflowLabel("future_kind", locale));
});

it.each(publicLocales)("labels property fact keys in %s without exposing a key", (locale) => {
  const keys = [
    "price",
    "location",
    "bedrooms",
    "rooms",
    "area",
    ...areaBases.map((basis) => `area.${basis}`),
    "feature.lift",
    "feature.step_free_access",
    "feature.parking",
  ];
  for (const key of keys) {
    const label = factFieldLabel(key, locale);
    expect(label, key).not.toBe(key);
    expect(label).not.toMatch(/[_.]/);
    if (locale === "he") expect(label).toMatch(/[א-ת]/);
  }
  expect(factFieldLabel("feature.future_internal_key", locale)).not.toContain(
    "future_internal_key",
  );
});

it.each(staffLocales)("covers the current Inventory enums in %s with catalog wording", (locale) => {
  for (const value of [
    ...propertyTypes,
    ...listingPurposes,
    ...areaBases,
    ...factStates,
    ...sourceClasses,
    ...commercialStates,
    ...editorialStates,
    ...pointerStates,
    ...priceBases,
    "month",
  ]) {
    const label = optionLabel(value, locale);
    expect(label, value).not.toMatch(
      /Other recorded value|Друга записана стойност|Другое записанное значение/,
    );
    expect(label).not.toContain("_");
  }
  expect(optionLabel("future_internal_key", locale)).not.toContain("future_internal_key");
});

describe("M-052 presentation guard", () => {
  it("requires a catalog instead of replacing separators in feature-screen codes", () => {
    function sources(dir: URL): URL[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
        return entry.isDirectory()
          ? sources(path)
          : /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
            ? [path]
            : [];
      });
    }
    const offenders = sources(new URL("../features/", import.meta.url)).filter((file) =>
      /\.replace(?:All)?\(\s*(?:["']_["']|\/\[[_.]+\]\/g|\/_\/g)\s*,\s*["'] ["']/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((file) => file.pathname)).toEqual([]);
  });
});
