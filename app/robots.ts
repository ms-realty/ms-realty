import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { stagingEnabled } from "@/i18n/seo";
import { publicSeoOrigin } from "@/server/seo/public-metadata";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await headers(); // Runtime configuration, never frozen into the immutable image.
  if (stagingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", publicSeoOrigin()).toString(),
  };
}
