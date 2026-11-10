// "Checked for you" for a draft translation (ADR 0012): a deterministic comparison with the source
// text and facts before a person approves the language. A failed check blocks the language with a
// plain reason; nothing here approves anything. No model call.
import { legacyTitleSuffixes } from "../config/tenant";
import type { PublicLocale } from "./ids";

export const translationBlockers = [
  "empty",
  "same_as_source",
  "numbers_differ",
  "inland_framed_as_coast",
  "length_implausible",
] as const;
export type TranslationBlocker = (typeof translationBlockers)[number];

export const translationWarnings = ["place_name_missing", "length_unusual"] as const;
export type TranslationWarning = (typeof translationWarnings)[number];

export interface TranslationCheckInput {
  readonly locale: PublicLocale;
  readonly title: string;
  readonly description: string;
  readonly source: { readonly title: string; readonly description: string };
  /** Figures the listing states: price (major units), area, bedrooms, the lot number. */
  readonly figures: readonly number[];
  /** The settlement in every script it is known by; one must appear when the source names it. */
  readonly placeNames: readonly string[];
}

export interface TranslationChecks {
  readonly blockers: readonly TranslationBlocker[];
  readonly warnings: readonly TranslationWarning[];
  /** Numbers in the translation that neither the source text nor the facts state. */
  readonly unexpectedNumbers: readonly number[];
}

/** Grouped numbers ("95 000", "95.000", "95,000") count as one; decimals keep their whole part. */
const numberPattern = /\d{1,3}(?:[ .,  ']\d{3})+(?!\d)|\d+/gu;

export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(numberPattern)) {
    const value = Number(match[0].replace(/[ .,  ']/gu, ""));
    if (Number.isSafeInteger(value)) found.add(value);
  }
  return found;
}

// Sandanski is inland (AGENTS.md); a translation may not move it to the sea in any language.
const inlandPlace = /sandanski|сандански|σαντάνσκι|סנדנסקי/iu;
const coastWords =
  /\b(?:sea|seaside|beach(?:es)?|coast(?:al|line)?|meer|strand|küste|zee|kust)\b|(?:^|[^\p{L}])(?:мор[еяю]|морск|плаж|крайбрежи|пляж|побережь|θάλασσ|παραλί|ακτή)|(?:^|[^\p{L}])[הלבו]?(?:ים|חוף)(?![\p{L}])/iu;

export function translationChecks(input: TranslationCheckInput): TranslationChecks {
  const blockers: TranslationBlocker[] = [];
  const warnings: TranslationWarning[] = [];
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) blockers.push("empty");
  if (
    (title && title === input.source.title.trim()) ||
    (description && description === input.source.description.trim())
  )
    blockers.push("same_as_source");
  const known = new Set([
    ...numbersIn(`${input.source.title} ${input.source.description}`),
    ...input.figures.filter((n) => Number.isFinite(n)).map((n) => Math.trunc(n)),
  ]);
  const unexpected = [...numbersIn(`${title} ${description}`)].filter((n) => !known.has(n));
  if (unexpected.length) blockers.push("numbers_differ");
  const text = `${title} ${description}`;
  if (
    (inlandPlace.test(text) || input.placeNames.some((name) => inlandPlace.test(name))) &&
    coastWords.test(text)
  )
    blockers.push("inland_framed_as_coast");
  const sourceLength = input.source.description.trim().length;
  if (sourceLength > 0 && description) {
    const ratio = description.length / sourceLength;
    if (ratio < 0.3 || ratio > 3) blockers.push("length_implausible");
    else if (ratio < 0.5 || ratio > 2) warnings.push("length_unusual");
  }
  const sourceNamesPlace = input.placeNames.some((name) =>
    `${input.source.title} ${input.source.description}`.toLowerCase().includes(name.toLowerCase()),
  );
  if (
    sourceNamesPlace &&
    !input.placeNames.some((name) => text.toLowerCase().includes(name.toLowerCase()))
  )
    warnings.push("place_name_missing");
  return { blockers, warnings, unexpectedNumbers: unexpected };
}

/** The title without the old site's brand ending for this locale, or null when it has none. */
export function withoutLegacySuffix(title: string, locale: PublicLocale): string | null {
  const trimmed = title.trim();
  for (const suffix of legacyTitleSuffixes[locale] ?? []) {
    for (const separator of [" - ", " – ", " — ", " | "]) {
      const ending = `${separator}${suffix}`;
      if (trimmed.toLowerCase().endsWith(ending.toLowerCase())) {
        const cleaned = trimmed.slice(0, trimmed.length - ending.length).trim();
        return cleaned || null;
      }
    }
  }
  return null;
}
