import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearFileCache, fileSignature, readThroughCached } from "../lib/file-cache.mjs";

test("readThroughCached serves the cached value until the file changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-file-cache-"));
  const filePath = path.join(dir, "ledger.jsonl");
  fs.writeFileSync(filePath, `${JSON.stringify({ n: 1 })}\n`);
  clearFileCache();
  let loads = 0;
  const loader = () => {
    loads += 1;
    return fs
      .readFileSync(filePath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  };

  const first = readThroughCached(filePath, loader);
  const second = readThroughCached(filePath, loader);
  assert.equal(loads, 1, "second read must be served from cache");
  assert.strictEqual(first, second, "cached read returns the same object");

  fs.appendFileSync(filePath, `${JSON.stringify({ n: 2 })}\n`);
  const third = readThroughCached(filePath, loader);
  assert.equal(loads, 2, "changed file must be re-read");
  assert.deepEqual(
    third.map((row) => row.n),
    [1, 2],
  );
});

test("readThroughCached defers to the loader for missing files", () => {
  clearFileCache();
  const missing = path.join(os.tmpdir(), "ms-realty-file-cache-missing.jsonl");
  assert.deepEqual(readThroughCached(missing, () => []), []);
});

test("fileSignature is null for missing files and present for existing files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-file-cache-sig-"));
  const filePath = path.join(dir, "state.json");
  assert.equal(fileSignature(filePath), null);
  fs.writeFileSync(filePath, "{}");
  assert.notEqual(fileSignature(filePath), null);
});

test("MS_REALTY_DISABLE_FILE_CACHE=1 bypasses the cache", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-file-cache-off-"));
  const filePath = path.join(dir, "ledger.jsonl");
  fs.writeFileSync(filePath, `${JSON.stringify({ n: 1 })}\n`);
  process.env.MS_REALTY_DISABLE_FILE_CACHE = "1";
  try {
    let loads = 0;
    const loader = () => {
      loads += 1;
      return [];
    };
    readThroughCached(filePath, loader);
    readThroughCached(filePath, loader);
    assert.equal(loads, 2, "disabled cache must call the loader every time");
  } finally {
    delete process.env.MS_REALTY_DISABLE_FILE_CACHE;
  }
});
