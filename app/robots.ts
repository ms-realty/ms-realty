import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { canonicalOrigin, isCanonicalHost, requestHost } from "@/i18n/seo";

// Only the canonical host may be crawled; preview, workers.dev and origin hosts disallow
// everything (spec §20.4). Non-indexable locales stay crawlable so their noindex is seen.
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Read per request: the answer depends on the host and on CANONICAL_ORIGIN at runtime.
  const host = requestHost(await headers());
  const origin = canonicalOrigin();
  if (!origin || !isCanonicalHost(host, origin)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}
