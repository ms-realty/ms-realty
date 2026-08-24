// Approved area guides: what a place is, who buys there, and how to reach it.
//
// Location pages today list inventory and say nothing about the place. This
// module supplies the missing copy under the guide approval discipline, keyed
// by the same `location` value the listings carry ("Sandanski", "Hotovo",
// "Petrich"), so a location page can read its guide without a second mapping.
//
// Two rules make this safe to publish:
//   1. Every statement must name a claim id that an attached official source
//      actually backs. A sentence without evidence cannot be stored.
//   2. Sea vocabulary is refused for any area not on the explicit sea-access
//      allowlist. Sandanski is an inland spa town in the Struma valley, and
//      AGENTS.md forbids framing it as a sea destination; that rule is enforced
//      here in validation rather than left to an editor's memory.
import {
  APPROVAL_REASONS,
  approvalState,
  markedAbsence,
  normalizeApproval,
  normalizeSources,
  optionalText,
  readApprovedRecordFile,
  requireLocale,
  requireText,
  reviewRows,
  sourceClaimIndex,
  stableHash,
  writeApprovedRecordFile,
} from "./approved-records.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_AREA_GUIDES_PATH = fromRoot("production", "data", "approved-area-guides.json");

export const AREA_GUIDE_SECTIONS = Object.freeze(["what_it_is", "who_buys_there", "how_to_reach"]);

// Areas where a sea claim can be true. Everything else, Sandanski included, is
// inland until a human adds it here with evidence. Fail closed: an unknown
// area key cannot claim the sea.
export const SEA_ACCESS_AREA_KEYS = Object.freeze([
  "Sveti Vlas",
  "Sunny Beach",
  "Paralia Ofrinio",
  "Elani-Sani, Halkidiki",
  "Pasalimani, Piraeus",
]);

// Named explicitly so the prohibition in AGENTS.md is greppable from the code
// that enforces it.
export const NEVER_A_SEA_DESTINATION = Object.freeze(["Sandanski", "Sandanski Municipality", "Melnik", "Hotovo", "Petrich"]);

// Sea vocabulary across the seven public locales plus the source language.
// Hebrew is matched on חוף (shore) and on הים followed by a non-Hebrew letter,
// because the bare ים is also the masculine plural ending and would refuse
// ordinary copy.
const SEA_CLAIM_PATTERN = new RegExp(
  [
    "\\bsea\\b",
    "\\bseaside\\b",
    "\\bseafront\\b",
    "\\bsea[- ]?views?\\b",
    "\\bbeach\\b",
    "\\bcoast(al|line)?\\b",
    "\\bshore\\b",
    "\\bwaterfront\\b",
    "мор[ея]",
    "морск",
    "крайбреж",
    "побереж",
    "плаж",
    "пляж",
    "\\bmeer\\b",
    "\\bstrand\\b",
    "\\bküste\\b",
    "\\bzee\\b",
    "\\bkust\\b",
    "θάλασσ",
    "παραλί",
    "ακτή",
    "חוף",
    "הים(?![\\u0590-\\u05FF])",
  ].join("|"),
  "iu",
);

export function containsSeaClaim(value) {
  return SEA_CLAIM_PATTERN.test(String(value || ""));
}

export function readApprovedAreaGuides(filePath = DEFAULT_APPROVED_AREA_GUIDES_PATH) {
  return readApprovedRecordFile(filePath, { collection: "guides" });
}

export function writeApprovedAreaGuides(document, { filePath = DEFAULT_APPROVED_AREA_GUIDES_PATH } = {}) {
  return writeApprovedRecordFile(document, { filePath });
}

export function areaGuideHashPayload(guide) {
  return {
    area_key: guide.area_key || "",
    locale: guide.locale || "",
    source_locale: guide.source_locale || "",
    source_document_id: guide.source_document_id || "",
    derived_from_document_id: guide.derived_from_document_id || "",
    title: guide.title || "",
    sea_access: guide.sea_access === true,
    sections: Object.fromEntries(
      AREA_GUIDE_SECTIONS.map((section) => [
        section,
        (guide.sections?.[section] || []).map((statement) => ({
          text: statement.text || "",
          claim_id: statement.claim_id || "",
          source_id: statement.source_id || "",
        })),
      ]),
    ),
    sources: (guide.sources || []).map((source) => ({
      id: source.id || "",
      publisher: source.publisher || "",
      url: source.url || "",
      checked_at: source.checked_at || "",
      claim_ids: source.claim_ids || [],
    })),
  };
}

export function areaGuideSourceHash(guide) {
  return stableHash(areaGuideHashPayload(guide));
}

function normalizeSections(input, label, sources) {
  const claims = sourceClaimIndex(sources);
  const sections = {};
  for (const section of AREA_GUIDE_SECTIONS) {
    const rows = input?.[section];
    if (rows === undefined || rows === null) continue;
    if (!Array.isArray(rows)) throw new Error(`${label}.${section} must be an array`);
    if (!rows.length) continue;
    sections[section] = rows.map((statement, index) => {
      const at = `${label}.${section}[${index}]`;
      const claimId = requireText(statement?.claim_id, `${at}.claim_id`, { max: 120 });
      const sourceId = requireText(statement?.source_id, `${at}.source_id`, { max: 120 });
      if (!claims.has(`${sourceId}:${claimId}`)) {
        throw new Error(`${at} cites ${sourceId}:${claimId}, which no attached source backs`);
      }
      return {
        text: requireText(statement?.text, `${at}.text`, { max: 600 }),
        claim_id: claimId,
        source_id: sourceId,
      };
    });
  }
  return sections;
}

// The sea rule, applied to the whole record. Called from normalize (so bad
// input cannot be stored) and from the assert (so a hand-edited file is
// caught before it reaches a page).
export function assertAreaGuideSeaRule(guide) {
  const areaKey = String(guide.area_key || "").trim();
  const seaAllowed = SEA_ACCESS_AREA_KEYS.includes(areaKey);
  if (guide.sea_access === true && !seaAllowed) {
    throw new Error(`Area guide ${areaKey} may not declare sea access; it is not on the sea-access allowlist`);
  }
  if (seaAllowed && guide.sea_access === true) return true;
  const copy = [
    guide.title,
    ...AREA_GUIDE_SECTIONS.flatMap((section) => (guide.sections?.[section] || []).map((statement) => statement.text)),
  ];
  for (const text of copy) {
    if (containsSeaClaim(text)) {
      throw new Error(`Area guide ${areaKey} must not describe an inland area as a sea destination`);
    }
  }
  return true;
}

export function normalizeAreaGuide(input = {}) {
  const label = `area guide ${String(input.id || input.area_key || "").trim() || "(unnamed)"}`;
  const sources = normalizeSources(input.sources || [], `${label}.sources`);
  const guide = {
    id: requireText(input.id, `${label}.id`, { max: 160 }),
    type: "area_guide",
    // The exact `location` value the listings and location pages already use.
    area_key: requireText(input.area_key, `${label}.area_key`, { max: 160 }),
    locale: requireLocale(input.locale, `${label}.locale`),
    source_locale: requireLocale(input.source_locale, `${label}.source_locale`),
    ...normalizeApproval(input, label),
    ...(input.source_document_id ? { source_document_id: requireText(input.source_document_id, `${label}.source_document_id`, { max: 160 }) } : {}),
    ...(input.human_translation_approved === true ? { human_translation_approved: true } : {}),
    // The approved CMS guide this copy was projected from, so the build script
    // can prove the sentence still matches its approved original.
    derived_from_document_id: optionalText(input.derived_from_document_id, `${label}.derived_from_document_id`, { max: 160 }),
    title: requireText(input.title, `${label}.title`, { max: 200 }),
    sea_access: input.sea_access === true,
    sections: normalizeSections(input.sections, label, sources),
    sources,
  };
  if (!Object.keys(guide.sections).length) throw new Error(`${label} must carry at least one section`);
  assertAreaGuideSeaRule(guide);
  guide.source_hash = requireText(input.source_hash || areaGuideSourceHash(guide), `${label}.source_hash`, { max: 64 });
  return guide;
}

export function areaGuideApprovalState(guide, { now } = {}) {
  return approvalState(guide, { hashPayload: areaGuideHashPayload, now });
}

export function isPublishableAreaGuide(guide, { now } = {}) {
  if (!areaGuideApprovalState(guide, { now }).publishable) return false;
  try {
    assertAreaGuideSeaRule(guide);
  } catch {
    return false;
  }
  return true;
}

export function publicAreaGuide(guide) {
  const sourceById = new Map((guide.sources || []).map((source) => [source.id, source]));
  return {
    area_key: guide.area_key,
    locale: guide.locale,
    title: guide.title,
    sections: AREA_GUIDE_SECTIONS.filter((section) => (guide.sections?.[section] || []).length).map((section) => ({
      id: section,
      statements: guide.sections[section].map((statement) => ({
        text: statement.text,
        source: sourceById.get(statement.source_id)
          ? {
              id: statement.source_id,
              publisher: sourceById.get(statement.source_id).publisher,
              label: sourceById.get(statement.source_id).label,
              url: sourceById.get(statement.source_id).url,
              checked_at: sourceById.get(statement.source_id).checked_at,
            }
          : null,
      })),
    })),
    sources: (guide.sources || []).map((source) => ({
      id: source.id,
      publisher: source.publisher,
      label: source.label,
      url: source.url,
      checked_at: source.checked_at,
    })),
    reviewer: guide.reviewer,
    approved_at: guide.approved_at,
  };
}

// One guide for one area in one locale. A locale with no approved guide gets
// nothing rather than the source-locale text, because an unread language is a
// worse answer than an honest absence.
export function approvedAreaGuideFor(document, areaKey, localeCode, { now } = {}) {
  return (
    (document?.guides || []).find(
      (guide) => guide.area_key === areaKey && guide.locale === localeCode && isPublishableAreaGuide(guide, { now }),
    ) || null
  );
}

export function areaGuidePayloadFor(document, areaKey, localeCode, { now } = {}) {
  const guide = approvedAreaGuideFor(document, areaKey, localeCode, { now });
  if (guide) return { available: true, ...publicAreaGuide(guide) };
  const candidates = (document?.guides || []).filter((row) => row.area_key === areaKey);
  if (!candidates.length) return markedAbsence(APPROVAL_REASONS.NOT_APPROVED, { area_key: areaKey, locale: localeCode });
  const localeMatch = candidates.find((row) => row.locale === localeCode);
  const reason = localeMatch
    ? areaGuideApprovalState(localeMatch, { now }).reason || APPROVAL_REASONS.NOT_APPROVED
    : APPROVAL_REASONS.NOT_TRANSLATED;
  return markedAbsence(reason, { area_key: areaKey, locale: localeCode });
}

export function areaGuideReviewRows(document, { now } = {}) {
  return reviewRows(document?.guides || [], {
    hashPayload: areaGuideHashPayload,
    now,
    describe: (guide) => ({
      area_key: guide.area_key,
      title: guide.title,
      sea_access: guide.sea_access === true,
      sections: Object.keys(guide.sections || {}),
      derived_from_document_id: guide.derived_from_document_id || null,
    }),
  });
}

export function assertApprovedAreaGuides(document) {
  if (!Array.isArray(document?.guides)) throw new Error("Approved area guides must contain a guides array");
  const ids = new Set();
  for (const raw of document.guides) {
    const guide = normalizeAreaGuide(raw);
    if (ids.has(guide.id)) throw new Error(`Area guide ids must be unique: ${guide.id}`);
    ids.add(guide.id);
    if (raw.source_hash && raw.source_hash !== areaGuideSourceHash(guide)) {
      throw new Error(`Area guide ${guide.id} source_hash does not cover its approved content`);
    }
    if (NEVER_A_SEA_DESTINATION.includes(guide.area_key) && guide.sea_access === true) {
      throw new Error(`Area guide ${guide.area_key} must never be framed as a sea destination`);
    }
  }
  return true;
}
