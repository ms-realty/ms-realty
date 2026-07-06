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

test("Hermes public chat rejects missing or invalid public questions", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();

  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "bad code", query: "Sandanski" }), /BCP 47/);
  assert.throws(() => buildHermesPublicChat(registry, seed, { locale: "en", query: "" }), /required/);
});
