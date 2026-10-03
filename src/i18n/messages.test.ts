import { readdirSync, readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import catalogStatus from "../../messages/_status.json";
import { publicLocales, defaultLocale as sourceLocale, staffLocales } from "./config";
import { publicNamespaces, staffNamespaces } from "./messages";

type Tree = { [key: string]: string | Tree };

const messagesDir = new URL("../../messages/", import.meta.url);

/** Namespaces are whatever JSON files a catalog directory holds. */
function namespacesIn(dir: string): string[] {
  return readdirSync(new URL(dir, messagesDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function catalog(dir: string): Tree {
  return Object.fromEntries(
    namespacesIn(dir).map((ns) => [
      ns,
      JSON.parse(readFileSync(new URL(`${dir}${ns}.json`, messagesDir), "utf8")),
    ]),
  );
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

/** Argument names used by an ICU message, including those inside plural branches. */
function argumentNames(message: string): string[] {
  return [...new Set([...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((match) => match[1] ?? ""))]
    .filter((name) => name !== "")
    .sort();
}

const sampleValues = {
  phone: "+359 879 696 870",
  year: 2026,
  date: "24.09.2026",
  time: "10:30",
  reason: "Reason.",
  reference: "RQ-2026-000042",
  language: "English",
};

const sets = [
  {
    name: "public",
    locales: publicLocales,
    dir: (locale: string) => `${locale}/`,
    namespaces: publicNamespaces,
  },
  {
    name: "staff",
    locales: staffLocales,
    dir: (locale: string) => `staff/${locale}/`,
    namespaces: staffNamespaces,
  },
] as const;

describe("message catalogs (ux-spec §19.1)", () => {
  it("keeps the public catalogs in one directory per locale and staff catalogs for bg/en/ru", () => {
    const dirs = readdirSync(messagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...publicLocales, "staff"].sort());
    expect(readdirSync(new URL("staff/", messagesDir)).sort()).toEqual([...staffLocales].sort());
  });

  for (const set of sets) {
    const source = flatten(catalog(set.dir(sourceLocale)));
    const sourceKeys = Object.keys(source).sort();

    describe(`${set.name} set`, () => {
      it("registers exactly the source's namespace files in src/i18n/messages.ts", () => {
        expect(namespacesIn(set.dir(sourceLocale))).toEqual([...set.namespaces].sort());
      });

      it.each([...set.locales])("%s has the source's namespaces and keys, none empty", (locale) => {
        expect(namespacesIn(set.dir(locale))).toEqual([...set.namespaces].sort());
        const flat = flatten(catalog(set.dir(locale)));
        expect(Object.keys(flat).sort()).toEqual(sourceKeys);
        for (const [key, message] of Object.entries(flat)) expect(message.trim(), key).not.toBe("");
      });

      it.each([...set.locales])("%s keeps every placeholder of the source message", (locale) => {
        const flat = flatten(catalog(set.dir(locale)));
        for (const key of sourceKeys) {
          expect(argumentNames(flat[key] ?? ""), `${locale}:${key}`).toEqual(
            argumentNames(source[key] ?? ""),
          );
        }
      });

      it.each([...set.locales])(
        "%s plural messages cover the locale's plural categories",
        (locale) => {
          const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
          for (const [key, message] of Object.entries(flatten(catalog(set.dir(locale))))) {
            if (!message.includes(", plural,")) continue;
            for (const category of categories) {
              expect(message, `${locale}:${key} lacks "${category}"`).toMatch(
                new RegExp(`\\b${category}\\s*\\{`),
              );
            }
          }
        },
      );

      it.each([...set.locales])("%s formats every message without ICU errors", (locale) => {
        const errors: string[] = [];
        const t = createTranslator({
          locale,
          messages: catalog(set.dir(locale)) as never,
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

      it.each([...set.locales])("%s has a review status entry", (locale) => {
        const status = (catalogStatus as Record<string, unknown>)[
          set.name === "public" ? "locales" : "staff"
        ] as Record<string, { status: string }>;
        expect(["draft_unreviewed", "approved"]).toContain(status[locale]?.status);
      });
    });
  }

  it("covers every global state from architecture §11.4", () => {
    const states = Object.keys(catalog("bg/").states as Tree);
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

  it("formats Russian plurals with the right forms", () => {
    const t = createTranslator({ locale: "ru", messages: catalog("ru/") as never });
    const rateLimited = (minutes: number) =>
      (t as unknown as (key: string, values: object) => string)("states.rateLimited.body", {
        minutes,
      });
    expect(rateLimited(1)).toContain("1 минуту");
    expect(rateLimited(3)).toContain("3 минуты");
    expect(rateLimited(5)).toContain("5 минут");
  });
});
