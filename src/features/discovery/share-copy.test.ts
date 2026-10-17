import { describe, expect, it } from "vitest";
import { publicLocales } from "@/i18n/config";
import { shareCopy, shareCopyRows } from "./share-copy";

// The agency's private work record has its own noun per audience; public share copy names none.
const banned = [
  /(?<![\p{L}])(случа|препис|дело|дела)/iu,
  /\b(case|cases|matter|matters)\b/i,
  /\b(Fall|Fälle|Akte|zaak|dossier)\b/u,
  /(?<![\p{L}])(υπόθεση|υπόθεσης|φάκελος)(?![\p{L}])/iu,
  /(?<![\p{L}])תיק(?![\p{L}])/u,
];
// Sandanski is inland: share copy must never frame any place as sea, beach or coast. Whole
// words only, so "search" and the Hebrew plural ending "ים" are not mistaken for "sea".
const coastal =
  /(?<![\p{L}])(sea|beach\p{L}*|coast\p{L}*|мор[еяюи]|морск\p{L}*|плаж\p{L}*|пляж\p{L}*|strand|küste\p{L}*|kust|θάλασσ\p{L}*|παραλί\p{L}*|ים|חוף\p{L}*)(?![\p{L}])/iu;

const rows = Object.entries(shareCopyRows);
const script: Record<string, RegExp> = {
  bg: /\p{Script=Cyrillic}/u,
  ru: /\p{Script=Cyrillic}/u,
  el: /\p{Script=Greek}/u,
  he: /\p{Script=Hebrew}/u,
};

describe("share copy", () => {
  it("has one non-empty line for each of the seven locales in every row", () => {
    expect(rows.length).toBeGreaterThan(60);
    for (const [key, row] of rows) {
      expect(row, key).toHaveLength(publicLocales.length);
      for (const text of row) expect(text.trim(), key).not.toBe("");
    }
  });

  it("writes each locale in its own script", () => {
    for (const locale of publicLocales) {
      const pattern = script[locale];
      if (!pattern) continue;
      for (const [key, text] of Object.entries(shareCopy(locale)))
        expect(text, `${locale}.${key}`).toMatch(pattern);
    }
  });

  it("never names the private work record or frames a place as coastal", () => {
    for (const locale of publicLocales)
      for (const [key, text] of Object.entries(shareCopy(locale))) {
        for (const pattern of banned) expect(text, `${locale}.${key}`).not.toMatch(pattern);
        expect(text, `${locale}.${key}`).not.toMatch(coastal);
      }
  });

  it("addresses the reader in capitalised polite Bulgarian", () => {
    // A lowercase second-person pronoun in Bulgarian copy is the familiar form.
    const familiar = /(?<![\p{L}])(вие|ви|ваш\p{L}*|вам|вас)(?![\p{L}])/u;
    for (const [key, text] of Object.entries(shareCopy("bg")))
      expect(text, `bg.${key}`).not.toMatch(familiar);
  });

  it("keeps the labels the spec fixes and the Bulgarian frames record", () => {
    const en = shareCopy("en");
    expect(en.linkTitle).toBe("Public link");
    expect(en.copy).toBe("Copy link");
    expect(en.revoke).toBe("Revoke this link");
    expect(en.revokedAt).toBe("Revoked");
    expect(en.checking).toBe("Checking revocation");
    expect(en.linksTitle).toBe("Shared links");
    const bg = shareCopy("bg");
    expect(bg.title).toBe("Споделен списък с имоти");
    expect(bg.badge).toBe("Публично споделен списък");
    expect(bg.shareSelected).toBe("Сподели избраните");
    expect(bg.shareTitle).toBe("Споделете само публичното");
    expect(bg.create).toBe("Създай връзка за тези обяви");
    expect(bg.created).toBe("Публичната връзка е създадена");
    expect(bg.viewAs).toBe("Виж публичния получателски изглед");
    expect(bg.publicOnly.startsWith("Тук са включени само публични обяви.")).toBe(true);
  });

  it("states the seven-day expiry and the limit of twelve in every locale", () => {
    for (const locale of publicLocales) {
      const copy = shareCopy(locale);
      expect(copy.expiry, locale).toMatch(/7/);
      expect(copy.limit, locale).toMatch(/12/);
    }
  });
});
