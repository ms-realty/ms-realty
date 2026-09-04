import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendSlugChange,
  assertSlugHistory,
  readSlugHistory,
  resetSlugHistory,
  slugRedirectForPath,
} from "../lib/slug-history.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function tempSlugHistory() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-slug-history-`)}/slug-history.jsonl`;
  resetSlugHistory(file);
  return file;
}

test("slug history creates canonical path-only 301s for listing slug changes", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const filePath = tempSlugHistory();
  const row = appendSlugChange(
    registry,
    seed,
    {
      id: "slug-change-test",
      listingId: "MS-00815",
      locale: "he",
      oldPath: "/he/properties/old-sandanski-slug",
      editor: "editor_bg",
    },
    { filePath, changedAt: "2026-07-05T00:00:00Z" },
  );

  assert.equal(row.status, 301);
  assert.equal(row.old_path, "/he/properties/old-sandanski-slug");
  assert.equal(row.new_path, "/he/properties/MS-00815");
  assert.equal(assertSlugHistory(readSlugHistory(filePath)), true);
  assert.deepEqual(slugRedirectForPath(readSlugHistory(filePath), "/he/properties/old-sandanski-slug"), row);
});

test("slug history rejects broad or non-canonical mappings", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const filePath = tempSlugHistory();

  assert.throws(
    () =>
      appendSlugChange(
        registry,
        seed,
        { listingId: "MS-00815", locale: "he", oldPath: "/he/search" },
        { filePath },
      ),
    /homepage or search-page/,
  );
  assert.throws(
    () =>
      appendSlugChange(
        registry,
        seed,
        {
          listingId: "MS-00815",
          locale: "he",
          oldPath: "/he/properties/old-sandanski-slug",
          newPath: "/he/search",
        },
        { filePath },
      ),
    /homepage or search-page/,
  );
  assert.throws(
    () =>
      appendSlugChange(
        registry,
        seed,
        {
          listingId: "MS-00815",
          locale: "he",
          oldPath: "/he/properties/old-sandanski-slug",
          newPath: "/he/properties/not-the-current-canonical",
        },
        { filePath },
      ),
    /current canonical listing path/,
  );
  assert.throws(
    () =>
      appendSlugChange(
        registry,
        seed,
        { listingId: "missing", locale: "he", oldPath: "/he/properties/old-sandanski-slug" },
        { filePath },
      ),
    /known listingId/,
  );
});
