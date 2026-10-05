import { readdirSync, readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import cognates from "../../messages/_cognates.json";
import catalogStatus from "../../messages/_status.json";
import { publicLocales, defaultLocale as sourceLocale, staffLocales } from "./config";
import invariants from "./copy-invariants.json";
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
  seconds: 30,
};

/** What a reader sees: no ICU syntax, placeholders or names that every locale shares. */
function visibleText(message: string): string {
  let text = message
    .replace(/\{\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,/g, " ")
    .replace(/(?:^|\s)(?:=\d+|zero|one|two|few|many|other)\s*\{/g, " ")
    .replace(/\{\s*\w+\s*\}/g, " ")
    .replace(/[{}#]/g, " ");
  for (const invariant of invariants.strings) text = text.split(invariant).join(" ");
  return text;
}
const hasWords = (message: string) => /\p{L}/u.test(visibleText(message));

/** Numbers without grouping separators, so 2000, 2,000 and 2.000 compare equal. */
const numbersIn = (message: string) =>
  (
    visibleText(message)
      .replace(/(\d)[\s.,](?=\d{3}(?!\d))/g, "$1")
      .match(/\d+/g) ?? []
  ).sort();
const urlsIn = (message: string) => (message.match(/https?:\/\/[^\s"'<>]+/g) ?? []).sort();

/** The script a locale's messages are written in; Latin locales may not contain the others. */
const localeScripts: Record<string, RegExp> = {
  bg: /\p{Script=Cyrillic}/u,
  ru: /\p{Script=Cyrillic}/u,
  el: /\p{Script=Greek}/u,
  he: /\p{Script=Hebrew}/u,
};
const nonLatinScript = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hebrew}]/u;

// AGENTS.md: Sandanski is inland. No message may place it by the sea, a beach or a coast.
const sandanski = /Sandanski|Сандански|Σαντάνσκι|סנדנסקי/iu;
const seaWords: Record<string, RegExp> = {
  bg: /(?<!\p{L})(?:море|морск|плаж|крайбреж)/iu,
  ru: /(?<!\p{L})(?:мор[еяю]|морск|пляж|побережь)/iu,
  en: /(?<!\p{L})(?:sea(?:side|front)?(?!\p{L})|beach|coast)/iu,
  de: /(?<!\p{L})(?:meer|strand|küste)/iu,
  nl: /(?<!\p{L})(?:zee(?!r)|strand|kust)/iu,
  el: /(?<!\p{L})(?:θάλασσ|παραλί|ακτ[ήέ])/iu,
  he: /(?<!\p{L})[הלבו]?(?:ים|חוף)(?!\p{L})/u,
};

const allowedCognates = cognates as unknown as Record<string, string[] | undefined>;
type Review = { status: string; reviewer: string | null; reviewedAt: string | null };

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

      // Catalog quality (design/i18n-uncatalogued-copy-plan.md §3.3).
      const english = flatten(catalog(set.dir("en")));

      it.each([...set.locales])("%s copies no bg or en value except listed cognates", (locale) => {
        const flat = flatten(catalog(set.dir(locale)));
        const references = [
          ...(locale === sourceLocale ? [] : [source]),
          ...(locale === "en" ? [] : [english]),
        ];
        const copied = (key: string) =>
          hasWords(flat[key] ?? "") && references.some((reference) => reference[key] === flat[key]);
        const listed = (allowedCognates[locale] ?? []).filter((key) => key in flat);
        expect(Object.keys(flat).filter((key) => copied(key) && !listed.includes(key))).toEqual([]);
        // A listed message whose value has changed since is stale: it must not hide a later copy.
        expect(listed.filter((key) => !copied(key))).toEqual([]);
      });

      it.each([...set.locales])("%s writes every message in its own script", (locale) => {
        const script = localeScripts[locale];
        const cognate = allowedCognates[locale] ?? [];
        const wrong = Object.entries(flatten(catalog(set.dir(locale))))
          .filter(([key, message]) => hasWords(message) && !cognate.includes(key))
          .filter(([, message]) =>
            script ? !script.test(visibleText(message)) : nonLatinScript.test(visibleText(message)),
          )
          .map(([key]) => key);
        expect(wrong).toEqual([]);
      });

      it.each([...set.locales])("%s keeps the source's numbers and links", (locale) => {
        const flat = flatten(catalog(set.dir(locale)));
        for (const key of sourceKeys) {
          const [message, original] = [flat[key] ?? "", source[key] ?? ""];
          expect(numbersIn(message), `${locale}:${key}`).toEqual(numbersIn(original));
          expect(urlsIn(message), `${locale}:${key}`).toEqual(urlsIn(original));
        }
      });

      it.each([...set.locales])("%s never places Sandanski by the sea", (locale) => {
        const sea = seaWords[locale] ?? /$^/;
        const wrong = Object.entries(flatten(catalog(set.dir(locale))))
          .filter(([, message]) => sandanski.test(message) && sea.test(message))
          .map(([key]) => key);
        expect(wrong).toEqual([]);
      });
    });
  }

  it("lists only cognates that name an existing message", () => {
    for (const [locale, keys] of Object.entries(allowedCognates)) {
      if (locale.startsWith("$")) continue;
      const known = {
        ...flatten(catalog(`${locale}/`)),
        ...(staffLocales.some((staff) => staff === locale)
          ? flatten(catalog(`staff/${locale}/`))
          : {}),
      };
      expect(
        (keys ?? []).filter((key) => !(key in known)),
        locale,
      ).toEqual([]);
    }
  });

  it("the catalog checks catch a copied value, a wrong script and a seaside Sandanski", () => {
    expect(hasWords("© {year} MS Realty")).toBe(false);
    expect(visibleText("{count, plural, one {# отговор} other {# отговора}}")).toMatch(/отговор/);
    expect(localeScripts.he?.test(visibleText("Search {reference}"))).toBe(false);
    expect(numbersIn("Up to 2,000 characters")).toEqual(numbersIn("До 2000 знака"));
    expect(numbersIn("Choose up to 4")).not.toEqual(numbersIn("Изберете до 3"));
    expect(sandanski.test("Апартамент в Сандански") && seaWords.bg?.test("близо до морето")).toBe(
      true,
    );
    expect(seaWords.he?.test("קרוב לים")).toBe(true);
    expect(seaWords.he?.test("מעיינות מים מינרליים")).toBe(false);
    expect(seaWords.nl?.test("Meer informatie, zeer rustig")).toBe(false);
  });

  describe("review status (_status.json)", () => {
    const status = catalogStatus as unknown as {
      locales: Record<string, Review>;
      staff: Record<string, Review>;
      namespaces?: Record<string, Record<string, Review> | string>;
    };
    // Reviewed with their locale entry; every namespace added later has entries of its own.
    const coveredByLocale = ["a11y", "common", "errors", "footer", "forms", "nav", "states"];
    const namespaceReviews = Object.entries(status.namespaces ?? {}).flatMap(([name, reviews]) =>
      typeof reviews === "string" ? [] : [[name, reviews] as const],
    );

    it("approves a catalog only with a named reviewer and a date", () => {
      const reviews = [
        ...Object.values(status.locales),
        ...Object.values(status.staff),
        ...namespaceReviews.flatMap(([, entries]) => Object.values(entries)),
      ];
      for (const review of reviews)
        expect(
          review.status === "draft_unreviewed" ||
            (review.status === "approved" &&
              Boolean(review.reviewer) &&
              Boolean(review.reviewedAt)),
          JSON.stringify(review),
        ).toBe(true);
    });

    it("gives every later public namespace a review entry per locale", () => {
      const later = publicNamespaces.filter((ns) => !coveredByLocale.includes(ns)).sort();
      expect(namespaceReviews.map(([name]) => name).sort()).toEqual(later);
      for (const [name, entries] of namespaceReviews)
        expect(Object.keys(entries).sort(), name).toEqual([...publicLocales].sort());
    });

    it("keeps a locale unapproved while one of its namespaces is a draft", () => {
      for (const locale of publicLocales) {
        if (status.locales[locale]?.status !== "approved") continue;
        for (const [name, entries] of namespaceReviews)
          expect(entries[locale]?.status, `${name}:${locale}`).toBe("approved");
      }
    });
  });

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
