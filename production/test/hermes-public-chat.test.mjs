import test from "node:test";
import assert from "node:assert/strict";
import { assertHermesPublicChat, buildHermesPublicChat } from "../lib/hermes-public-chat.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTranslationLedger } from "../lib/translation-ledger.mjs";

test("Hermes public chat answers only from approved listing sources with fallback disclosure", () => {
  const response = buildHermesPublicChat(
    loadLocaleRegistry(),
    loadCmsSeed(),
    { locale: "he", query: "Sandanski" },
    { translationTasks: readTranslationLedger() },
  );

  assert.equal(assertHermesPublicChat(response), true);
  assert.equal(response.dir, "rtl");
  assert.equal(response.can_publish, false);
  assert.equal(response.fallback_used, true);
  assert.ok(response.citations.length > 0);
  assert.ok(response.citations.every((citation) => citation.path.startsWith("/he/")));
  assert.match(response.disclosure, /approved MS Realty/);
  assert.match(response.disclosure, /not reviewed/);
});

test("Hermes public chat cites approved CMS process facts for foreign-buyer questions", () => {
  const response = buildHermesPublicChat(
    loadLocaleRegistry(),
    loadCmsSeed(),
    { locale: "he", query: "Can a non-EU buyer own land in Bulgaria through an OOD?" },
    { translationTasks: readTranslationLedger() },
  );

  assert.equal(assertHermesPublicChat(response), true);
  assert.equal(response.citations[0].type, "cms_page");
  assert.equal(response.citations[0].id, "foreign-buyers-bg-land-ownership");
  assert.match(response.answer, /Non-EU buyers cannot own Bulgarian land directly/);
  assert.match(response.answer, /lawyer before signing/);
  assert.equal(response.can_publish, false);
  assert.equal(response.fallback_used, true);
});

test("Hermes public chat rejects missing or invalid public questions", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();

  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "bad code", query: "Sandanski" }), /BCP 47/);
  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "en", query: "" }), /required/);
});
