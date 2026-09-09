import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adoptReleaseR2MediaCoverageReport } from "../lib/r2-media-coverage.mjs";

const SHA = "4576bf3de6e143b9ba16e92d1da6353656ae7739";
const OLD = "db7cd1037226c1ea51319e936eed13b84a5179b9";

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msr-r2-adopt-"));
  const write = (name, body) => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body));
    return file;
  };
  return { dir, write };
}

test("the exact-release report replaces the previous release's copy on the evidence volume", () => {
  const { dir, write } = scratch();
  const source = write("release/production/data/r2-media-coverage-report.json", { release_sha: SHA, generated_at: "2026-09-08T15:57:46.328Z", status: "pass" });
  const target = write("runtime-evidence/r2-media-coverage-report.json", { release_sha: OLD, generated_at: "2026-09-06T12:32:57.375Z", status: "pass" });
  const result = adoptReleaseR2MediaCoverageReport({ sourcePath: source, targetPath: target, expectedReleaseSha: SHA });
  assert.equal(result.adopted, true);
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).release_sha, SHA);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ["r2-media-coverage-report.json"], "no staging file is left behind");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a report for another release never overwrites the volume", () => {
  const { dir, write } = scratch();
  const source = write("release/production/data/r2-media-coverage-report.json", { release_sha: OLD, generated_at: "2026-09-06T12:32:57.375Z", status: "pass" });
  const target = write("runtime-evidence/r2-media-coverage-report.json", { release_sha: "aaaa", generated_at: "2026-09-01T00:00:00.000Z" });
  const result = adoptReleaseR2MediaCoverageReport({ sourcePath: source, targetPath: target, expectedReleaseSha: SHA });
  assert.equal(result.adopted, false);
  assert.equal(result.reason, "release_sha_mismatch");
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).release_sha, "aaaa");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("missing source, unversioned build and an already current volume are no-ops", () => {
  const { dir, write } = scratch();
  const target = write("runtime-evidence/r2-media-coverage-report.json", { release_sha: SHA, generated_at: "2026-09-08T15:57:46.328Z" });
  assert.equal(adoptReleaseR2MediaCoverageReport({ sourcePath: path.join(dir, "nope.json"), targetPath: target, expectedReleaseSha: SHA }).reason, "missing_source");
  const source = write("release/production/data/r2-media-coverage-report.json", { release_sha: SHA, generated_at: "2026-09-08T15:57:46.328Z" });
  assert.equal(adoptReleaseR2MediaCoverageReport({ sourcePath: source, targetPath: target, expectedReleaseSha: "unversioned" }).reason, "not_applicable");
  assert.equal(adoptReleaseR2MediaCoverageReport({ sourcePath: source, targetPath: target, expectedReleaseSha: SHA }).reason, "already_current");
  fs.rmSync(dir, { recursive: true, force: true });
});
