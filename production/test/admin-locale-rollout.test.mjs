import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAdminLocaleRolloutPayload } from "../lib/locale-admin.mjs";
import { buildLocaleRolloutReport } from "../lib/locale-rollout.mjs";
import { buildTranslationCoverageReport } from "../lib/translation-coverage.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

// The rollout report has always routed an operator to /admin/locales for a
// language a visitor asked for. Until now that route was a 404.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-locale-rollout-"));
const copy = (name) => {
  const target = path.join(dataDir, name);
  fs.copyFileSync(path.join(ROOT, "production/data", name), target);
  return target;
};

const app = () =>
  createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-admin-locale-rollout-key-32c",
  });

const get = async (url) => {
  const res = await dispatchHttp(app(), { url, headers: AUTH });
  return res;
};

test("the language a visitor asked for opens the screen the rollout report points at", async () => {
  const report = buildLocaleRolloutReport({ generatedAt: "2026-07-19T12:00:00.000Z" });
  assert.ok(report.activation_tasks.length, "some language is waiting on an operator decision");

  for (const task of report.activation_tasks) {
    const res = await get(`${task.admin_path}&locale=en`);
    assert.equal(res.status, 200, `${task.admin_path} resolves`);
    assert.match(res.body, new RegExp(`data-locale-row="${task.locale}"`));
    // Following the task lands with that language already filled in, so the
    // operator does not retype what the report just told them.
    assert.match(res.body, new RegExp(`name="code"[^>]*value="${task.locale}"`));
  }
});

test("every language in the registry is on the screen with its rollout state", async () => {
  const registry = loadLocaleRegistry();
  const res = await get("/admin/locales?locale=en");

  for (const locale of registry.locales) {
    assert.match(res.body, new RegExp(`data-locale-row="${locale.code}"`), `${locale.code} has a row`);
  }
  assert.match(res.body, /data-locale-row="bg" data-locale-state="source"/);
  assert.match(res.body, /data-locale-row="fr" data-locale-state="requested"/);
  // Hebrew is a right-to-left build, not a stylesheet flip, and the row says so.
  assert.match(res.body, /data-locale-row="he"[\s\S]{0,400}RTL/);
});

test("the coverage figures come from the coverage report, not from the screen", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const generatedAt = "2026-07-19T12:00:00.000Z";
  const coverage = buildTranslationCoverageReport({ registry, seed, translationTasks: [], generatedAt });
  const payload = renderAdminLocaleRolloutPayload(registry, "en", { seed, translationTasks: [], generatedAt });

  for (const row of payload.locales) {
    if (row.is_source) continue;
    const open = coverage.rows.filter((task) => task.target_locale === row.code).length;
    assert.equal(row.listings.open, open, `${row.code} reports the open tasks the coverage report counted`);
    if (row.listings.scanned) {
      assert.equal(row.listings.done + row.listings.open, row.listings.total, `${row.code} accounts for every listing`);
    } else {
      // A language the coverage report never walks raises no tasks, which is
      // not the same as being translated. Reading zero tasks as "done" would
      // show a language nobody has touched as complete.
      assert.equal(row.listings.open, 0);
      assert.equal(row.listings.done, 0, `${row.code} is not counted as done just because nothing was scanned`);
    }
  }
  const unscanned = payload.locales.filter((row) => !row.is_source && !row.listings.scanned).map((row) => row.code);
  assert.deepEqual(unscanned, ["fr"], "the requested language is the one the coverage report does not walk");
  assert.equal(payload.summary.open_listing_tasks, coverage.summary.open_translation_tasks);
});

test("a count is a way into the work behind it", async () => {
  const res = await get("/admin/locales?locale=en");
  // Every non-source language's listing figure is a link into that language's
  // translation queue. A number a broker cannot open is a number they cannot act on.
  for (const code of ["en", "de", "nl", "ru", "el", "he"]) {
    assert.match(res.body, new RegExp(`href="/admin/translations\\?targetLocale=${code}"[^>]*data-locale-listings="${code}"`));
  }
});

test("the add form cannot open a language, and nothing on the screen removes one", async () => {
  const res = await get("/admin/locales?locale=en");

  // A new language starts closed. Indexing it is the translation queue's job:
  // a human approval per listing, not a checkbox on this form.
  assert.match(res.body, /<input type="hidden" name="public_enabled" value="false"/);
  assert.match(res.body, /<input type="hidden" name="indexable" value="false"/);
  assert.doesNotMatch(res.body, /name="indexable"[^>]*type="checkbox"/);
  assert.doesNotMatch(res.body, /name="public_enabled"[^>]*type="checkbox"/);

  // Removal is a terminal decision per URL, so the screen states the
  // consequence and routes to migration review instead of offering a button.
  assert.match(res.body, /data-locale-remove-consequence="true"/);
  assert.match(res.body, /EN, DE, NL, RU, EL, HE/);
  assert.match(res.body, /href="\/admin\/migration\/review"/);
  assert.doesNotMatch(res.body, /action="\/api\/admin\/locales\/delete"/);
});

test("the screen is reachable from the rail and from settings", async () => {
  const today = await get("/admin/today?locale=en");
  assert.match(today.body, /data-admin-nav-route="locale_rollout"/);

  const settings = await get("/admin/settings?locale=en");
  assert.match(settings.body, /data-settings-locale-link="true"><a href="\/admin\/locales"/);
});
