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
          id: "caller-supplied-id-must-be-ignored",
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
  // Identity is minted server-side; a caller-supplied id is ignored outright.
  assert.match(rows[0].id, /^language-request-[0-9a-f-]{36}$/);
  assert.notEqual(rows[0].id, "caller-supplied-id-must-be-ignored");
  assert.equal(rows[0].contact_ref, rows[0].id);
  assert.equal(assertLanguageRequests(rows), true);
});

test("language requests mint unique ids and collapse retries on an idempotency key", () => {
  const registry = loadLocaleRegistry();
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-language-idem-`)}/requests.jsonl`;
  resetLanguageRequests(file);
  const submit = (extra = {}) =>
    appendLanguageRequest(
      privacySafeLanguageRequest(
        createLanguageRequest(
          registry,
          { requested_locale: "de", requested_path: "/de/", contact: { name: "Anna", email: "anna@example.test" }, ...extra },
          "2026-07-04T00:00:00Z",
        ),
      ),
      { filePath: file },
    );

  // Two distinct people requesting the same locale must not collapse onto one
  // record — the old deterministic `language-request-de` id did exactly that.
  const first = submit();
  const second = submit();
  assert.notEqual(first.id, second.id);
  assert.equal(readLanguageRequests(file).length, 2);

  // A retried submission carrying the same key returns the original record.
  const retried = submit({ idempotencyKey: "browser-retry-1" });
  const retriedAgain = submit({ idempotencyKey: "browser-retry-1" });
  assert.equal(retried.id, retriedAgain.id);
  assert.equal(readLanguageRequests(file).length, 3);

  assert.throws(() => createLanguageRequest(registry, { requested_locale: "de", requested_path: "/de/", idempotencyKey: "bad key!" }), /idempotencyKey/);
});

test("language requests reject invalid language codes", () => {
  assert.throws(
    () => createLanguageRequest(loadLocaleRegistry(), { requestedLocale: "not a locale", requestedPath: "/x/" }),
    /BCP 47/,
  );
});
