import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("requires explicit feature labels instead of turning underscored model codes into copy", () => {
  const root = fileURLToPath(new URL("../features", import.meta.url));
  const offenders: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        if (/\.replaceAll\(\s*["']_["']\s*,\s*["'] ["']\s*\)/.test(readFileSync(path, "utf8")))
          offenders.push(relative(root, path));
      }
    }
  };
  visit(root);
  expect(offenders).toEqual([]);
});
