import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// The environment's binding chooses its cache bucket. Private pages remain dynamic/no-store.
export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
