// Regenerates docs/api/openapi.json from the transport registry (architecture §19.3).
// Usage: tsx --conditions=react-server scripts/openapi.mjs
// (the condition lets server-only modules load outside Next; the registry test fails when stale)
import { buildOpenApiDocument } from "../src/server/transport/openapi.ts";
import { writeJsonFiles } from "./format-json.mjs";

writeJsonFiles({ "docs/api/openapi.json": buildOpenApiDocument() });
console.log("Wrote docs/api/openapi.json");
