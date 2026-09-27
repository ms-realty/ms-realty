// Writes JSON files in the repository's Biome format, so generated files pass `npm run lint`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Stable representation shared by generated-file writers and drift checks. */
export function formatJson(value) {
  return execFileSync("npx", ["biome", "format", "--stdin-file-path=generated.json"], {
    input: `${JSON.stringify(value, null, 2)}\n`,
    encoding: "utf8",
  });
}

/** @param {Record<string, unknown>} files path → value */
export function writeJsonFiles(files) {
  const paths = Object.keys(files);
  for (const path of paths) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(files[path], null, 2)}\n`);
  }
  execFileSync("npx", ["biome", "format", "--write", ...paths], { stdio: "ignore" });
}
