// The committed JSON Schemas in release/schemas match src/release/schemas.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { releaseJsonSchemas } from "./json-schemas";

describe("release JSON Schemas", () => {
  for (const [file, schema] of Object.entries(releaseJsonSchemas())) {
    it(`release/schemas/${file} is current (regenerate: tsx scripts/release-schemas.mjs)`, () => {
      const committed = JSON.parse(readFileSync(join("release/schemas", file), "utf8"));
      expect(committed).toEqual(schema);
    });
  }
});
