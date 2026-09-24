// Accept-Language negotiation (F01, A02). The result only ever SUGGESTS a language or picks
// the destination of a bare `/`; an explicit locale in a URL is never overridden.

/** Language ranges from an Accept-Language header, best first; q=0 ranges are dropped. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [range = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { range: range.trim().toLowerCase(), quality, index };
    })
    .filter((entry) => entry.range && entry.range !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.range);
}

// Deprecated ISO 639 codes that browsers still send.
const aliases: Record<string, string> = { iw: "he" };

/** The first supported locale matching a language range by its primary subtag, or null. */
export function negotiateLocale<L extends string>(
  header: string | null | undefined,
  supported: readonly L[],
): L | null {
  for (const range of parseAcceptLanguage(header)) {
    const primary = range.split("-")[0] ?? "";
    const language = aliases[primary] ?? primary;
    const match = supported.find((locale) => locale === language);
    if (match) return match;
  }
  return null;
}
