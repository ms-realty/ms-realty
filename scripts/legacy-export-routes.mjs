// Export is deliberately unavailable until genuine equivalence evidence exists. No stub map.
import { readFileSync } from "node:fs";
import { exportReviewedRoutes } from "../src/server/legacy/manifest.ts";

exportReviewedRoutes(JSON.parse(readFileSync("data/legacy/migration/route-manifest.json", "utf8")));
