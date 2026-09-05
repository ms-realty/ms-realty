import test from "node:test";
import assert from "node:assert/strict";
import {
  validateHermesListingCopyDraft,
  validateHermesReplyDraft,
  validateHermesTranslationDraft,
} from "../lib/hermes.mjs";
import { containsSeaClaim, framesInlandPlaceAsSea, mentionsInlandPlace } from "../lib/sea-claims.mjs";

// Sandanski is an inland spa town in the Struma valley. Bulgarian is the source
// editorial language, so the sentence that has to be refused is written in
// Cyrillic with an inflected noun — which is exactly what the Hermes validators
// used to let through, because they matched /sandanski/i against Latin text and
// held a whole-word token list that no Slavic case ending could satisfy.

const CYRILLIC_SEA = "Апартамент в Сандански на две крачки от плажа.";
const GREEK_SEA = "Διαμέρισμα στο Σαντάνσκι, δίπλα στην παραλία.";
const HEBREW_SEA = "דירה בסנדנסקי ליד חוף הים.";
const HONEST = "Апартамент в Сандански, в долината на Струма, близо до минералните бани.";

test("the town is recognised in every script the product ships", () => {
  for (const text of [CYRILLIC_SEA, GREEK_SEA, HEBREW_SEA, "Apartment in Sandanski"]) {
    assert.equal(mentionsInlandPlace(text), true, text);
  }
  // The old Latin-only test would have said no to all three of these.
  assert.equal(/sandanski/i.test(CYRILLIC_SEA), false);
  assert.equal(/sandanski/i.test(GREEK_SEA), false);
  assert.equal(/sandanski/i.test(HEBREW_SEA), false);
});

test("an inflected sea word still reads as a sea claim", () => {
  // "плажа", not "плаж": a whole-word list matches the second and misses the first.
  assert.equal(containsSeaClaim("на две крачки от плажа"), true);
  assert.equal(containsSeaClaim("морето е далече"), true);
  assert.equal(containsSeaClaim("в долината на Струма"), false);
});

test("only a sea claim about one of the inland towns is refused", () => {
  assert.equal(framesInlandPlaceAsSea(CYRILLIC_SEA), true);
  assert.equal(framesInlandPlaceAsSea(HONEST), false);
  // A genuine coastal listing elsewhere is not this rule's business.
  assert.equal(framesInlandPlaceAsSea("Apartment in Burgas, two minutes from the beach"), false);
});

test("every Hermes validator refuses the same sentence", () => {
  const facts = { price_eur: 68000, area_sqm: 72, bedrooms: 2 };
  const snapshot = { source_hash: "hash-1" };

  assert.throws(
    () =>
      validateHermesTranslationDraft({
        draft: { body: `${CYRILLIC_SEA} 68000 72 2`, citations: [{ source: "listing" }] },
        propertyFacts: facts,
        sourceSnapshot: snapshot,
      }),
    /sea destination/,
  );

  assert.throws(
    () =>
      validateHermesReplyDraft({
        draft: { text: CYRILLIC_SEA },
        lead: { lead_id: "lead-1" },
        prompt: { language: "bg" },
      }),
    /sea destination/,
  );

  assert.throws(
    () =>
      validateHermesListingCopyDraft({
        draft: { text: `${CYRILLIC_SEA} Още малко текст, за да мине минималната дължина на описанието.` },
        field: "description",
        propertyFacts: facts,
      }),
    /sea destination/,
  );
});

test("an honest draft in the same language still passes", () => {
  const facts = { price_eur: 68000, area_sqm: 72, bedrooms: 2 };
  const draft = validateHermesListingCopyDraft({
    draft: { text: `${HONEST} Площ 72 кв.м, 2 спални, цена 68000 евро.` },
    field: "description",
    propertyFacts: facts,
  });
  assert.equal(draft.status, "hermes_drafted");
  assert.equal(draft.can_publish, false);
  assert.equal(draft.human_approval_required, true);
});
