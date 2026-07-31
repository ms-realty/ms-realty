import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fromRoot, repoRelativePath } from "../lib/paths.mjs";

test("report paths are stable inside the repository without rewriting external paths", () => {
  assert.equal(repoRelativePath(fromRoot("production", "data", "launch-readiness.json")), "production/data/launch-readiness.json");
  assert.equal(repoRelativePath(path.join(os.tmpdir(), "ms-realty-external-report.json")), path.join(os.tmpdir(), "ms-realty-external-report.json"));
  assert.equal(repoRelativePath("production/data/launch-readiness.json"), "production/data/launch-readiness.json");
});
