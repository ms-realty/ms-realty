// Normalize the drafted buyer-guide translations and recompute every
// source_hash, so an edited draft cannot carry an approval that was recorded
// against different words.
//
// This script never publishes. It cannot: assertDraftGuideTranslations()
// refuses any row that reports itself publishable, and the approved file is
// not written from here at all. Promoting a row is a human act, described in
// the publishing_note of production/data/draft-guide-translations.json.
import {
  assertDraftGuideTranslations,
  guideTranslationSourceHash,
  normalizeGuideTranslation,
  readDraftGuideTranslations,
  writeDraftGuideTranslations,
} from "../lib/guide-translations.mjs";
import { isPublishableGuide, readApprovedCmsContent } from "../lib/approved-content.mjs";

const GENERATED_AT = process.env.MS_REALTY_GENERATED_AT || "2026-08-25T00:00:00Z";

const approved = readApprovedCmsContent();
const approvedById = new Map((approved.documents || []).map((doc) => [doc.id, doc]));

const document = readDraftGuideTranslations();
const translations = (document.translations || [])
  .map((row) => {
    const normalized = normalizeGuideTranslation(row);
    return { ...normalized, source_hash: guideTranslationSourceHash(normalized) };
  })
  .sort((a, b) => a.guide_key.localeCompare(b.guide_key) || a.locale.localeCompare(b.locale));

// A translation of a document nobody approved would be a translation of
// nothing. Refuse it here rather than let a reviewer discover it later.
for (const row of translations) {
  const source = approvedById.get(row.source_document_id);
  if (!source) throw new Error(`Guide translation ${row.id} names an unknown source document ${row.source_document_id}`);
  if (!isPublishableGuide(source)) {
    throw new Error(`Guide translation ${row.id} translates ${row.source_document_id}, which is not an approved guide`);
  }
  if (source.locale !== row.source_locale) {
    throw new Error(`Guide translation ${row.id} claims source locale ${row.source_locale}, but the document is ${source.locale}`);
  }
}

assertDraftGuideTranslations({ translations });
const { outPath } = writeDraftGuideTranslations({ ...document, generated_at: GENERATED_AT, translations });

const byLocale = translations.reduce((counts, row) => ({ ...counts, [row.locale]: (counts[row.locale] || 0) + 1 }), {});
console.log(`Wrote ${translations.length} drafted guide translations to ${outPath}`);
for (const [locale, count] of Object.entries(byLocale).sort()) {
  console.log(`  ${locale}: ${count} awaiting human translation approval`);
}
