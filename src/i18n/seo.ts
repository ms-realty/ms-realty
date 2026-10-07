// Public crawl policy from the owner zero-loss launch gate (2026-10-01).
// Private surfaces retain their own access and index restrictions.
import type { Metadata } from "next";
import { defaultLocale, type PublicLocale, publicLocales } from "./config";

export function stagingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.STAGING === undefined || env.STAGING === "false") return false;
  if (env.STAGING === "true") return true;
  throw new Error("STAGING must be explicitly true or false");
}

export function canonicalOrigin(env: Record<string, string | undefined> = process.env): URL | null {
  const value = env.CANONICAL_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname.endsWith(".localhost");
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

// Forwarded headers cannot choose identity. Proxy authenticates Host with the gateway.
export function requestHost(headers: Pick<Headers, "get">): string | null {
  return headers.get("host");
}
export function isCanonicalHost(host: string | null, origin: URL | null): boolean {
  return Boolean(host && origin && host.toLowerCase() === origin.host.toLowerCase());
}
export function localizedPath(locale: PublicLocale, path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "";
  return clean === "/" || clean === ""
    ? `/${locale}`
    : `/${locale}${clean.startsWith("/") ? clean : `/${clean}`}`;
}
export interface LocalizedMetadataInput {
  readonly locale: PublicLocale;
  readonly path: string;
  readonly host: string | null;
  readonly origin?: URL | null;
  // Exact published siblings; never generated translations or unavailable pages.
  readonly availableIn?: readonly PublicLocale[];
  readonly staging?: boolean;
}
export function localizedMetadata({
  locale,
  path,
  origin = canonicalOrigin(),
  availableIn = publicLocales,
  staging = stagingEnabled(),
}: LocalizedMetadataInput): Pick<Metadata, "alternates" | "robots"> {
  const robots = { index: !staging, follow: !staging };
  if (!origin) return { robots };
  const url = (target: PublicLocale) => new URL(localizedPath(target, path), origin).toString();
  const siblings = publicLocales.filter((target) => availableIn.includes(target));
  const languages = Object.fromEntries(siblings.map((target) => [target, url(target)]));
  if (siblings.includes(defaultLocale)) languages["x-default"] = url(defaultLocale);
  return { alternates: { canonical: url(locale), languages }, robots };
}
export const privateRobots: Metadata["robots"] = { index: false, follow: false };
