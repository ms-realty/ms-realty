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
  assert.equal(response.source_policy, "approved_ms_realty_only");
  assert.ok(response.citations.length > 0);
  assert.ok(response.citations.every((citation) => citation.path.startsWith("/he/")));
  assert.match(response.disclosure, /מקורות מאושרים/);
  assert.match(response.disclosure, /עדיין לא נבדק/);
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

test("Hermes public chat localizes source-bound listing boilerplate for Greek", () => {
  const response = buildHermesPublicChat(
    loadLocaleRegistry(),
    loadCmsSeed(),
    { locale: "el", query: "Sandanski" },
    { translationTasks: readTranslationLedger() },
  );

  assert.equal(assertHermesPublicChat(response), true);
  assert.equal(response.source_policy, "approved_ms_realty_only");
  assert.match(response.answer, /Βρήκα/);
  assert.match(response.disclosure, /εγκεκριμένες πηγές/);
});

test("Hermes public chat rejects missing or invalid public questions", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();

  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "bad code", query: "Sandanski" }), /BCP 47/);
  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "en", query: "" }), /required/);
});

test("Hermes public chat rejects protocol-relative and backslash citation paths", () => {
  const response = buildHermesPublicChat(
    loadLocaleRegistry(),
    loadCmsSeed(),
    { locale: "en", query: "Sandanski" },
    { translationTasks: readTranslationLedger() },
  );

  response.citations[0].path = "//untrusted.example/listing";
  assert.throws(() => assertHermesPublicChat(response), /citations/);

  response.citations[0].path = "/\\untrusted.example/listing";
  assert.throws(() => assertHermesPublicChat(response), /citations/);
});
