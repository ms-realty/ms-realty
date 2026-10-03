// Regenerates release/schemas/*.schema.json from src/release/schemas.ts.
// Usage: tsx scripts/release-schemas.mjs   (src/release/json-schemas.test.ts fails when stale)
import { join } from "node:path";
import { releaseJsonSchemas } from "../src/release/json-schemas.ts";
import { writeJsonFiles } from "./format-json.mjs";

const schemas = releaseJsonSchemas();
writeJsonFiles(
  Object.fromEntries(
    Object.entries(schemas).map(([file, schema]) => [join("release/schemas", file), schema]),
  ),
);
console.log(`Wrote ${Object.keys(schemas).length} schemas to release/schemas`);
