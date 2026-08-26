import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";
import { HERO_ASSET_CACHE, IMMUTABLE_ASSET_CACHE } from "./production/lib/asset-cache-headers.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

export default withPayload({
  turbopack: { root },
  skipTrailingSlashRedirect: true,
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
