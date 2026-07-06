import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";

const root = path.dirname(fileURLToPath(import.meta.url));

export default withPayload({
  turbopack: { root },
});
