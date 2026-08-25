import test from "node:test";
import assert from "node:assert/strict";
import { isPublishableGuide, readApprovedCmsContent } from "../lib/approved-content.mjs";
import {
  assertDraftGuideTranslations,
  cmsDocumentFromDraft,
  guideTranslationSourceHash,
  isPublishableGuideTranslation,
  normalizeGuideTranslation,
  readDraftGuideTranslations,
} from "../lib/guide-translations.mjs";

const PUBLIC_LOCALES = ["de", "nl", "ru", "el", "he"];

test("every locale without buyer guides has a drafted translation of every approved English guide", () => {
  const drafts = readDraftGuideTranslations();
  const approved = readApprovedCmsContent();
  const englishGuideKeys = (approved.documents || [])
    .filter((doc) => isPublishableGuide(doc) && doc.locale === "en")
    .map((doc) => doc.guide_key)
    .sort();

  assert.equal(assertDraftGuideTranslations(drafts), true);
  assert.ok(englishGuideKeys.length > 0);

  for (const locale of PUBLIC_LOCALES) {
    const forLocale = drafts.translations.filter((row) => row.locale === locale);
    assert.deepEqual(
      forLocale.map((row) => row.guide_key).sort(),
      englishGuideKeys,
      `${locale} must carry a draft of every approved English guide`,
    );
    // Written in the target language, not copied from the source.
    for (const row of forLocale) {
      const source = approved.documents.find((doc) => doc.id === row.source_document_id);
      assert.notEqual(row.title, source.title, `${row.id} title is still the English one`);
      assert.equal(row.facts.length, source.facts.length, `${row.id} must translate every approved fact`);
      for (const [index, fact] of row.facts.entries()) {
        assert.notEqual(fact, source.facts[index], `${row.id} fact ${index} is still the English one`);
      }
      assert.ok(row.path.startsWith(`/${locale}/guides/`), `${row.id} must be routed under its own locale`);
    }
  }
});

test("a drafted translation can never publish itself, whatever the file says", () => {
  const drafts = readDraftGuideTranslations();

  for (const row of drafts.translations) {
    assert.equal(isPublishableGuideTranslation(row), false, `${row.id} must not be publishable`);
    assert.equal(row.human_approved, false);
    assert.equal(row.reviewer, "");
    assert.equal(row.drafted_by, "claude_translator");
    assert.equal(row.source_hash, guideTranslationSourceHash(row));
  }

  // The draft lane refuses to record a translation approval at all: that
  // belongs on the approved document a human signs, not on a drafter's file.
  assert.throws(
    () => normalizeGuideTranslation({ ...drafts.translations[0], human_translation_approved: true }),
    /draft lane/,
  );
  // A locale that is its own source is not a translation.
  assert.throws(() => normalizeGuideTranslation({ ...drafts.translations[0], locale: "en" }), /other than its source locale/);
  // A path outside the target locale would publish under the wrong language.
  assert.throws(() => normalizeGuideTranslation({ ...drafts.translations[0], path: "/en/guides/buying-process" }), /must live under/);
});

test("promoting a draft leaves every approval field for a human to fill in", () => {
  const drafts = readDraftGuideTranslations();
  const document = cmsDocumentFromDraft(drafts.translations[0]);

  assert.equal(document.type, "guide");
  assert.equal(document.status, "draft");
  assert.equal(document.human_approved, false);
  assert.equal(document.human_translation_approved, false);
  assert.equal(document.reviewer, "");
  assert.equal(document.approved_at, "");
  assert.ok(document.source_document_id);
  // And so it is refused by the public guide gate exactly as it stands.
  assert.equal(isPublishableGuide(document), false);
});

test("the drafts stay out of every public surface until a human approves them", () => {
  const approved = readApprovedCmsContent();
  const drafts = readDraftGuideTranslations();
  const draftTitles = new Set(drafts.translations.map((row) => row.title));

  // Nothing from the draft lane has leaked into the approved content file.
  for (const doc of approved.documents || []) {
    assert.equal(draftTitles.has(doc.title), false, `${doc.id} carries drafted translation copy`);
  }
  // The approved file still publishes only its source-locale guides.
  for (const doc of (approved.documents || []).filter((row) => row.type === "guide")) {
    assert.equal(isPublishableGuide(doc) && doc.locale !== doc.source_locale, false);
  }
});
