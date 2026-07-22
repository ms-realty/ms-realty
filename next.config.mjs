import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";

const root = path.dirname(fileURLToPath(import.meta.url));

export default withPayload({
  turbopack: { root },
  async headers() {
    return [
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
});
