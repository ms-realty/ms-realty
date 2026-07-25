import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";

const root = path.dirname(fileURLToPath(import.meta.url));

export default withPayload({
  turbopack: { root },
  skipTrailingSlashRedirect: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // q=70 is emitted by the public-site srcset; 75 is the Next default.
    qualities: [70, 75],
    // Legacy upload originals are stable URLs — cache optimizer output long.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      { protocol: "https", hostname: "makler-realty.com" },
      { protocol: "https", hostname: "makler-realty.ru" },
    ],
  },
  async headers() {
    return [
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
});
