import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";
import { HERO_ASSET_CACHE, IMMUTABLE_ASSET_CACHE } from "./production/lib/asset-cache-headers.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

const config = withPayload({
  turbopack: { root },
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "makler-realty.com", port: "", pathname: "/media/**", search: "" },
    ],
  },
  async headers() {
    return [
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }],
      },
      {
        // Without this the hero photographs inherit Next's default for
        // public/, `max-age=0`, so the largest-contentful-paint image costs a
        // blocking round trip on every navigation just to be told it has not
        // changed.
        source: "/hero/:path*",
        headers: [{ key: "Cache-Control", value: HERO_ASSET_CACHE }],
      },
    ];
  },
});

// Payload marks its theme hint critical on every route, making Chrome retry
// the first navigation. Our website and CRM already apply the theme before
// paint with CSS and the storage bootstrap; only Payload needs the SSR hint.
const payloadHeaders = config.headers;
config.headers = async () => [
  ...(await payloadHeaders()).map(rule => ({ ...rule, headers: rule.headers.filter(header => header.key.toLowerCase() !== "critical-ch") })),
  { source: "/payload-admin/:path*", headers: [{ key: "Critical-CH", value: "Sec-CH-Prefers-Color-Scheme" }] },
];

export default config;
