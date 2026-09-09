import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  appendSavedSearch,
  assertSavedSearches,
  createSavedSearch,
  privacySafeSavedSearch,
  readSavedSearches,
  resetSavedSearches,
} from "../lib/saved-searches.mjs";

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
        {
          locale: "not a locale",
          query: "Sandanski",
          contact: { name: "Noa Levi", email: "noa@example.test" },
          alertConsent: true,
        },
        { savedAt: "2026-07-04T00:07:00Z" },
      ),
    /BCP 47/,
  );

  const nativeFormSearch = createSavedSearch(
    registry,
    {
      language: "he",
      query: "Sandanski",
      filters: JSON.stringify({ property_type: "apartment" }),
      "contact.name": "Noa Levi",
      "contact.email": "noa@example.test",
      contact_preference: "email",
      alertConsent: "true",
    },
    { savedAt: "2026-07-04T00:06:00Z" },
  );
  assert.equal(nativeFormSearch.locale, "he");
  assert.deepEqual(nativeFormSearch.filters, { property_type: "apartment" });
  assert.equal(nativeFormSearch.search_intent.schema_version, 1);
  assert.deepEqual(nativeFormSearch.search_intent.property_families, ["apartment"]);
  assert.equal(nativeFormSearch.contact.name, "Noa Levi");
  assert.equal(nativeFormSearch.contact_preference, "email");

  appendSavedSearch(
    privacySafeSavedSearch(
      createSavedSearch(
        registry,
        {
          id: "caller-supplied-id-must-be-ignored",
          locale: "fr",
          query: "Sandanski",
          filters: { property_type: "apartment" },
          contact: { name: "Claire Martin", whatsapp: "+33600000000" },
          contact_preference: "whatsapp",
          alertConsent: true,
          owner: "caller-supplied-owner-must-be-ignored",
          priceSnapshot: { "MS-00815": 120000, ignored: "not-a-number" },
        },
        { matchCount: 12, savedAt: "2026-07-04T00:07:00Z" },
      ),
    ),
    { filePath: file },
  );

  const rows = readSavedSearches(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requested_locale, "fr");
  assert.equal(rows[0].locale, "en");
  assert.equal(rows[0].fallback_used, true);
  assert.equal(rows[0].contact, undefined);
  // Identity is minted server-side; a caller-supplied id is ignored outright.
  assert.match(rows[0].id, /^saved-search-[0-9a-f-]{36}$/);
  assert.notEqual(rows[0].id, "caller-supplied-id-must-be-ignored");
  assert.equal(rows[0].contact_ref, rows[0].id);
  assert.match(rows[0].alert_task.id, /^alert-[0-9a-f-]{36}$/);
  assert.equal(rows[0].contact_preference, "whatsapp");
  assert.deepEqual(rows[0].price_snapshot, { "MS-00815": 120000 });
  assert.equal(rows[0].alert_task.status, "open");
  assert.equal(rows[0].alert_task.owner, "unassigned");
  assert.equal(rows[0].search_intent.schema_version, 1);
  assert.equal(assertSavedSearches(rows), true);
});
