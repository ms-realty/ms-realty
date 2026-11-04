import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("R02 listing review command handles frozen inputs and human decisions", () => {
  const suite = fileURLToPath(new URL("./release-listing-review.test.py", import.meta.url));
  const result = spawnSync("python3", [suite, "-v"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  const diagnostics = (result.stdout + result.stderr).trim().slice(-8192);
  assert.equal(
    result.status,
    0,
    `R02 Python suite ended with ${result.signal ?? result.status}\n${diagnostics}`,
  );
});
