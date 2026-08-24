// Buyer-guide translations waiting for a human translator.
//
// The buyer guides live in production/data/approved-cms-content.json, and that
// file admits approved content only: assertApprovedCmsContent() refuses any
// document that isPublishableGuide() rejects, and a document whose locale is
// not its source locale is publishable only with human_translation_approved.
// AGENTS.md says the same thing in prose -- "public translations must be
// human-approved before indexing", and an agent "must not publish pages, mark
// translations indexable, or approve legal/tax/process claims".
//
// So a drafted translation has nowhere honest to sit in that file, and the
// listing translation ledger is not it either: /admin/translations is built
// from the listing coverage report, so a guide row dropped there would be
// invisible to the reviewer it was meant for.
//
// This module is that missing lane. It holds finished translation copy under
// the ordinary approval discipline of approved-records.mjs, reports every row
// as blocked on translation_not_approved, and can never mark anything
// publishable: cmsDocumentFromDraft() deliberately emits a document with the
// approval fields empty, so promoting one into the approved file is an act a
// named human performs, not something a build script can do by itself.
import {
  APPROVAL_REASONS,
  approvalState,
  normalizeApproval,
  normalizeSources,
  optionalText,
  readApprovedRecordFile,
  requireLocale,
  requireStringList,
  requireText,
  reviewRows,
  stableHash,
  writeApprovedRecordFile,
} from "./approved-records.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_DRAFT_GUIDE_TRANSLATIONS_PATH = fromRoot("production", "data", "draft-guide-translations.json");

export function readDraftGuideTranslations(filePath = DEFAULT_DRAFT_GUIDE_TRANSLATIONS_PATH) {
  return readApprovedRecordFile(filePath, { collection: "translations" });
}

export function writeDraftGuideTranslations(document, { filePath = DEFAULT_DRAFT_GUIDE_TRANSLATIONS_PATH } = {}) {
  return writeApprovedRecordFile(document, { filePath });
}

// The fields a translator actually signs off on. A later edit to any of them
// invalidates whatever approval had been recorded.
export function guideTranslationHashPayload(row) {
  return {
    guide_key: row.guide_key || "",
    locale: row.locale || "",
    source_locale: row.source_locale || "",
    source_document_id: row.source_document_id || "",
    title: row.title || "",
    path: row.path || "",
    keywords: row.keywords || [],
    facts: row.facts || [],
    sources_label: row.sources_label || "",
    sources: (row.sources || []).map((source) => ({
      id: source.id || "",
      publisher: source.publisher || "",
      url: source.url || "",
      checked_at: source.checked_at || "",
      claim_ids: source.claim_ids || [],
    })),
  };
}

export function guideTranslationSourceHash(row) {
  return stableHash(guideTranslationHashPayload(row));
}

export function normalizeGuideTranslation(input = {}) {
  const label = `guide translation ${String(input.id || "").trim() || "(unnamed)"}`;
  const locale = requireLocale(input.locale, `${label}.locale`);
  const sourceLocale = requireLocale(input.source_locale, `${label}.source_locale`);
  if (locale === sourceLocale) throw new Error(`${label} must target a locale other than its source locale`);
  const row = {
    id: requireText(input.id, `${label}.id`, { max: 160 }),
    type: "guide_translation",
    // The approved English document this copy translates, so a reviewer can
    // put the two side by side and the hash can prove which text was signed.
    source_document_id: requireText(input.source_document_id, `${label}.source_document_id`, { max: 160 }),
    guide_key: requireText(input.guide_key, `${label}.guide_key`, { max: 160 }),
    locale,
    source_locale: sourceLocale,
    ...normalizeApproval(input, label),
    // Who wrote the draft. Separate from `reviewer`, which stays empty until a
    // human reviews it: drafting is not reviewing.
    drafted_by: requireText(input.drafted_by, `${label}.drafted_by`, { max: 64 }),
    drafted_at: requireText(input.drafted_at, `${label}.drafted_at`, { max: 40 }),
    title: requireText(input.title, `${label}.title`, { max: 200 }),
    path: requireText(input.path, `${label}.path`, { max: 400 }),
    keywords: requireStringList(input.keywords, `${label}.keywords`, { max: 120 }),
    facts: requireStringList(input.facts, `${label}.facts`, { max: 600 }),
    sources_label: optionalText(input.sources_label, `${label}.sources_label`, { max: 200 }),
    sources: normalizeSources(input.sources || [], `${label}.sources`),
  };
  if (!row.path.startsWith(`/${locale}/`)) {
    throw new Error(`${label}.path must live under /${locale}/`);
  }
  // Checked on the input, not on the row above: the row never carries the
  // field, so reading it back would make this guard silently vacuous.
  if (input.human_translation_approved === true) {
    throw new Error(`${label} is a draft lane; a human approves a translation in the approved CMS content, not here`);
  }
  row.source_hash = requireText(input.source_hash || guideTranslationSourceHash(row), `${label}.source_hash`, { max: 64 });
  return row;
}

export function guideTranslationApprovalState(row, { now } = {}) {
  return approvalState(row, { hashPayload: guideTranslationHashPayload, now });
}

// Always false, by construction: a row in this file has no human approval of
// the translation, which is exactly the condition approvalState() reports as
// translation_not_approved. The function exists so callers can ask rather
// than assume.
export function isPublishableGuideTranslation(row, { now } = {}) {
  return guideTranslationApprovalState(row, { now }).publishable === true;
}

// The shape production/data/approved-cms-content.json stores, with the
// approval envelope left empty. A named human fills in reviewer, approved_at,
// human_approved and human_translation_approved, and only then does the
// document belong in the approved file.
export function cmsDocumentFromDraft(row) {
  return {
    id: `${row.guide_key}-${row.locale}`,
    type: "guide",
    guide_key: row.guide_key,
    locale: row.locale,
    source_locale: row.source_locale,
    source_document_id: row.source_document_id,
    status: "draft",
    human_approved: false,
    human_translation_approved: false,
    reviewer: "",
    approved_at: "",
    title: row.title,
    path: row.path,
    keywords: row.keywords,
    facts: row.facts,
    ...(row.sources_label ? { sources_label: row.sources_label } : {}),
    ...(row.sources.length ? { sources: row.sources } : {}),
  };
}

export function guideTranslationReviewRows(document, { now } = {}) {
  return reviewRows(document?.translations || [], {
    hashPayload: guideTranslationHashPayload,
    now,
    describe: (row) => ({
      guide_key: row.guide_key,
      title: row.title,
      path: row.path,
      source_document_id: row.source_document_id,
      drafted_by: row.drafted_by || null,
      drafted_at: row.drafted_at || null,
      facts: (row.facts || []).length,
      // Named for the reviewer, so the queue says what is missing rather than
      // just that something is.
      awaiting: APPROVAL_REASONS.NOT_TRANSLATED,
    }),
  });
}

export function assertDraftGuideTranslations(document) {
  if (!Array.isArray(document?.translations)) throw new Error("Draft guide translations must contain a translations array");
  const ids = new Set();
  for (const raw of document.translations) {
    const row = normalizeGuideTranslation(raw);
    if (ids.has(row.id)) throw new Error(`Guide translation ids must be unique: ${row.id}`);
    ids.add(row.id);
    if (raw.source_hash && raw.source_hash !== guideTranslationSourceHash(row)) {
      throw new Error(`Guide translation ${row.id} source_hash does not cover its drafted content`);
    }
    if (isPublishableGuideTranslation(row)) {
      throw new Error(`Guide translation ${row.id} must not report itself publishable from the draft lane`);
    }
  }
  return true;
}
