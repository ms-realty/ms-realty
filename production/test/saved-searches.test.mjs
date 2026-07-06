import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { appendSavedSearch, assertSavedSearches, createSavedSearch, readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";

test("saved search stores criteria and creates alert task", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-saved-searches-`)}/saved-searches.jsonl`;
  const registry = loadLocaleRegistry();
  resetSavedSearches(file);

  assert.throws(
    () => createSavedSearch(registry, { locale: "he", query: "Sandanski" }, { savedAt: "2026-07-04T00:07:00Z" }),
    /contact.name/,
  );
  assert.throws(
    () =>
      createSavedSearch(
        registry,
        { locale: "not a locale", query: "Sandanski", contact: { name: "Noa Levi" } },
        { savedAt: "2026-07-04T00:07:00Z" },
      ),
    /BCP 47/,
  );

  appendSavedSearch(
    createSavedSearch(
      registry,
      {
        id: "saved-search-test",
        locale: "fr",
        query: "Sandanski",
        filters: { property_type: "apartment" },
        contact: { name: "Claire Martin" },
        priceSnapshot: { "MS-CRAWL-0001": 120000, ignored: "not-a-number" },
      },
      { matchCount: 12, savedAt: "2026-07-04T00:07:00Z" },
    ),
    { filePath: file },
  );

  const rows = readSavedSearches(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requested_locale, "fr");
  assert.equal(rows[0].locale, "en");
  assert.equal(rows[0].fallback_used, true);
  assert.deepEqual(rows[0].price_snapshot, { "MS-CRAWL-0001": 120000 });
  assert.equal(rows[0].alert_task.status, "open");
  assert.equal(assertSavedSearches(rows), true);
});
