// Regenerates docs/api/openapi.json from the transport registry (architecture §19.3).
// Usage: tsx --conditions=react-server scripts/openapi.mjs
// (the condition lets server-only modules load outside Next; the registry test fails when stale)

import { readFileSync } from "node:fs";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { buildOpenApiDocument } from "../src/server/transport/openapi.ts";
import { writeJsonFiles } from "./format-json.mjs";

const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
const document = buildOpenApiDocument();
if (values.check) {
  if (
    !isDeepStrictEqual(
      JSON.parse(readFileSync("docs/api/openapi.json", "utf8")),
      JSON.parse(JSON.stringify(document)),
    )
  ) {
    throw new Error("docs/api/openapi.json is stale; run npm run openapi:generate");
  }
  console.log("OpenAPI artifact is current");
} else {
  writeJsonFiles({ "docs/api/openapi.json": document });
  console.log("Wrote docs/api/openapi.json");
}
