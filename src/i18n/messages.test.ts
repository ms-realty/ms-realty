import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { type PublicLocale, publicLocales } from "./config";

type Tree = { [key: string]: string | Tree };

const catalogs = Object.fromEntries(
  publicLocales.map((locale) => [
    locale,
    JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")),
  ]),
) as Record<PublicLocale, Tree>;

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

const flat = Object.fromEntries(
  publicLocales.map((locale) => [locale, flatten(catalogs[locale])]),
) as Record<PublicLocale, Record<string, string>>;
const sourceKeys = Object.keys(flat.en).sort();

/** Argument names used by an ICU message, including those inside plural branches. */
function argumentNames(message: string): string[] {
  return [...new Set([...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((match) => match[1] ?? ""))]
    .filter((name) => name !== "")
    .sort();
}

const sampleValues = {
  count: 3,
  minutes: 2,
  phone: "+359 879 696 870",
  year: 2026,
  date: "24.09.2026",
  time: "10:30",
  reason: "Reason.",
  reference: "RQ-2026-000042",
  language: "English",
};

describe("message catalogs (§18.2, AD9)", () => {
  it("defines the shell namespaces", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      ["a11y", "common", "errors", "footer", "forms", "nav", "states"].sort(),
    );
  });

  it("covers every global state from §17.1", () => {
    const states = Object.keys(catalogs.en.states as Tree);
    for (const state of [
      "loading",
      "refreshing",
      "emptyNew",
      "emptyFiltered",
      "partial",
      "stale",
      "permissionLimited",
      "sessionExpired",
      "offline",
      "slow",
      "validationError",
      "serverRejection",
      "unknownOutcome",
      "versionConflict",
      "dirtyDraft",
      "savedDraft",
      "success",
      "revoked",
      "rateLimited",
      "unsupported",
    ]) {
      expect(states).toContain(state);
    }
  });

  it.each(publicLocales)("%s has exactly the English keys, none empty", (locale) => {
    expect(Object.keys(flat[locale]).sort()).toEqual(sourceKeys);
    for (const [key, message] of Object.entries(flat[locale])) {
      expect(message.trim(), key).not.toBe("");
    }
  });

  it.each(publicLocales)("%s keeps every placeholder of the source message", (locale) => {
    for (const key of sourceKeys) {
      expect(argumentNames(flat[locale][key] ?? ""), `${locale}:${key}`).toEqual(
        argumentNames(flat.en[key] ?? ""),
      );
    }
  });

  it.each(publicLocales)("%s plural messages cover the locale's plural categories", (locale) => {
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    for (const [key, message] of Object.entries(flat[locale])) {
      if (!message.includes(", plural,")) continue;
      for (const category of categories) {
        expect(message, `${locale}:${key} lacks "${category}"`).toMatch(
          new RegExp(`\\b${category}\\s*\\{`),
        );
      }
    }
  });

  it.each(publicLocales)("%s formats every message without ICU errors", (locale) => {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages: catalogs[locale] as never,
      onError: (error) => errors.push(error.message),
    });
    for (const key of sourceKeys) {
      for (const count of [0, 1, 2, 5, 21]) {
        (t as unknown as (key: string, values: object) => string)(key, {
          ...sampleValues,
          count,
          minutes: count,
        });
      }
    }
    expect(errors).toEqual([]);
  });

  it("formats Russian plurals with the right forms", () => {
    const t = createTranslator({ locale: "ru", messages: catalogs.ru as never });
    const rateLimited = (minutes: number) =>
      (t as unknown as (key: string, values: object) => string)("states.rateLimited.body", {
        minutes,
      });
    expect(rateLimited(1)).toContain("1 минуту");
    expect(rateLimited(3)).toContain("3 минуты");
    expect(rateLimited(5)).toContain("5 минут");
  });
});
