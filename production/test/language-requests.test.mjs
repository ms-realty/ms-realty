import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendLanguageRequest,
  assertLanguageRequests,
  createLanguageRequest,
  privacySafeLanguageRequest,
  readLanguageRequests,
  resetLanguageRequests,
} from "../lib/language-requests.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";

test("language requests persist unsupported locales without indexability", () => {
  const registry = loadLocaleRegistry();
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-language-`)}/requests.jsonl`;
  resetLanguageRequests(file);
  appendLanguageRequest(
    privacySafeLanguageRequest(
      createLanguageRequest(
        registry,
        {
          id: "language-request-fr-test",
          requested_locale: "fr",
          requested_path: "/fr/",
          contact: { name: "Claire", email: "claire@example.test" },
          message: "Please notify me when French is reviewed.",
        },
        "2026-07-04T00:00:00Z",
      ),
    ),
    { filePath: file },
  );

  const rows = readLanguageRequests(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requested_locale, "fr");
  assert.equal(rows[0].fallback_locale, "en");
  assert.equal(rows[0].admin_locale, "en");
  assert.equal(rows[0].public_indexable, false);
  assert.equal(rows[0].contact, undefined);
  assert.equal(rows[0].message, undefined);
  assert.equal(rows[0].contact_ref, "language-request-fr-test");
  assert.equal(assertLanguageRequests(rows), true);
});

test("language requests reject invalid language codes", () => {
  assert.throws(
    () => createLanguageRequest(loadLocaleRegistry(), { requestedLocale: "not a locale", requestedPath: "/x/" }),
    /BCP 47/,
  );
});
