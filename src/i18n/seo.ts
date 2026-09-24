// Crawl and index metadata (spec §20.4). Only indexable locales get canonical/hreflang;
// every non-canonical host (preview, workers.dev, origin IP) is noindex and robots-blocked.
import type { Metadata } from "next";
import { defaultLocale, indexableLocales, type PublicLocale } from "./config";

/** The production origin, e.g. https://makler-realty.com. Unset means nothing is canonical. */
export function canonicalOrigin(env: Record<string, string | undefined> = process.env): URL | null {
  const value = env.CANONICAL_ORIGIN;
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Host a request was addressed to, as seen before any proxy in front of the app. */
export function requestHost(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host");
}

export function isCanonicalHost(host: string | null, origin: URL | null): boolean {
  return Boolean(host && origin && host.toLowerCase() === origin.host.toLowerCase());
}

/** `/bg` + `/areas` → `/bg/areas`; the path never carries a query (utm_*, gclid, …). */
export function localizedPath(locale: PublicLocale, path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "";
  return clean === "/" || clean === ""
    ? `/${locale}`
    : `/${locale}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

export interface LocalizedMetadataInput {
  readonly locale: PublicLocale;
  /** Locale-independent path of the page, e.g. "/" or "/areas/sandanski". */
  readonly path: string;
  readonly host: string | null;
  readonly origin?: URL | null;
  /** Locales that hold an approved version of this page; defaults to every indexable one. */
  readonly availableIn?: readonly PublicLocale[];
  /** Indexable locales; defaults to the registry's approval-derived set. */
  readonly indexable?: readonly PublicLocale[];
}

/** Canonical, hreflang alternates (indexable locales + x-default → bg) and robots. */
export function localizedMetadata({
  locale,
  path,
  host,
  origin = canonicalOrigin(),
  availableIn,
  indexable = indexableLocales(),
}: LocalizedMetadataInput): Pick<Metadata, "alternates" | "robots"> {
  if (!origin || !isCanonicalHost(host, origin)) {
    return { robots: { index: false, follow: false } };
  }
  // A locale with no approved version of this page, or not approved for indexing, is never
  // indexed or canonicalised (AGENTS.md: indexable only after a human approves it).
  if (!indexable.includes(locale) || (availableIn && !availableIn.includes(locale))) {
    return { robots: { index: false, follow: true } };
  }

  const alternatesFor = indexable.filter(
    (candidate) => !availableIn || availableIn.includes(candidate),
  );
  const url = (target: PublicLocale) => new URL(localizedPath(target, path), origin).toString();
  const languages: Record<string, string> = {};
  for (const target of alternatesFor) languages[target] = url(target);
  if (alternatesFor.includes(defaultLocale)) languages["x-default"] = url(defaultLocale);

  return {
    alternates: { canonical: url(locale), languages },
    robots: { index: true, follow: true },
  };
}

/** Private surfaces are excluded by access control; this only keeps them out of indexes. */
export const privateRobots: Metadata["robots"] = { index: false, follow: false };
