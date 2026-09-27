// Regenerates release/schemas/*.schema.json from src/release/schemas.ts.
// Usage: tsx scripts/release-schemas.mjs   (src/release/json-schemas.test.ts fails when stale)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { releaseJsonSchemas } from "../src/release/json-schemas.ts";
import { writeJsonFiles } from "./format-json.mjs";

const schemas = releaseJsonSchemas();
const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
const files = Object.fromEntries(
  Object.entries(schemas).map(([file, schema]) => [join("release/schemas", file), schema]),
);
if (values.check) {
  for (const [file, schema] of Object.entries(files)) {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(file, "utf8")), schema)) {
      throw new Error(`${file} is stale; run npm run release:schemas`);
    }
  }
  console.log("Release schemas are current");
} else {
  writeJsonFiles(files);
  console.log(`Wrote ${Object.keys(schemas).length} schemas to release/schemas`);
}
