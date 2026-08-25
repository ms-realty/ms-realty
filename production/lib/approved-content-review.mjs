// The admin review payload for approved content.
//
// Package A2 owns the admin CMS screens, so this module supplies only the
// contract a review screen needs: every record of every approved-content type,
// publishable or not, with the reason each one is being withheld and what a
// human must supply to release it. It lives in its own file so A2 and B2 do
// not edit admin-payloads.mjs at the same time.
import {
  DEFAULT_APPROVED_AREA_GUIDES_PATH,
  areaGuideReviewRows,
  readApprovedAreaGuides,
} from "./area-guides.mjs";
import {
  DEFAULT_APPROVED_FINANCING_PARTNERS_PATH,
  financingPartnerReviewRows,
  readApprovedFinancingPartners,
} from "./financing-partners.mjs";
import {
  DEFAULT_APPROVED_PURCHASE_FEES_PATH,
  purchaseFeeReviewRows,
  purchaseFeeTableStatus,
  readApprovedPurchaseFees,
} from "./purchase-fees.mjs";
import {
  DEFAULT_APPROVED_TEAM_PROFILES_PATH,
  readApprovedTeamProfiles,
  teamProfileReviewRows,
} from "./team-profiles.mjs";
import {
  DEFAULT_DRAFT_GUIDE_TRANSLATIONS_PATH,
  guideTranslationReviewRows,
  readDraftGuideTranslations,
} from "./guide-translations.mjs";

// What a human has to do before each surface can publish. Shown next to the
// blocked rows so an approver is not left guessing.
const PUBLISH_REQUIREMENTS = {
  team_profiles:
    "Replace the example rows with real people, add the licence reference and an approved photo where they exist, set status to approved with your operator id and approved_at, then rebuild so source_hash covers the approved text.",
  area_guides:
    "Approve a location guide in the CMS content with one fact and one official source, map its claim id to an area-guide section in production/scripts/build-approved-content.mjs, and rebuild. An inland area may never be described as a sea destination.",
  financing_partners:
    "Replace the example rows with lenders the agency actually works with, set review_due_at, and add a rate only together with its effective date, approved_at and your operator id.",
  purchase_fees:
    "Supply the approved municipal transfer tax, notary tariff, registry entry fee, agency fee and company-route cost, each with its official source, effective_from and max_approval_age_days, then approve and rebuild.",
  guide_translations:
    "Read each draft beside the approved English document named in source_document_id and correct it. To publish one, move it into production/data/approved-cms-content.json with your operator id in reviewer, an approved_at, and human_approved and human_translation_approved set to true, then rebuild so source_hash covers the words you approved. These are legal-adjacent claims about Bulgarian property law: approving them is a human act, and until you do, the home page keeps pointing readers at the English originals.",
};

function loadOrEmpty(filePath, loader, collection) {
  try {
    return loader(filePath || undefined);
  } catch {
    return { [collection]: [] };
  }
}

export function approvedContentReviewPayload({
  teamProfilePath = null,
  areaGuidePath = null,
  financingPartnerPath = null,
  purchaseFeePath = null,
  guideTranslationPath = null,
  now = new Date().toISOString(),
} = {}) {
  const team = loadOrEmpty(teamProfilePath || DEFAULT_APPROVED_TEAM_PROFILES_PATH, readApprovedTeamProfiles, "profiles");
  const areas = loadOrEmpty(areaGuidePath || DEFAULT_APPROVED_AREA_GUIDES_PATH, readApprovedAreaGuides, "guides");
  const financing = loadOrEmpty(
    financingPartnerPath || DEFAULT_APPROVED_FINANCING_PARTNERS_PATH,
    readApprovedFinancingPartners,
    "partners",
  );
  const fees = loadOrEmpty(purchaseFeePath || DEFAULT_APPROVED_PURCHASE_FEES_PATH, readApprovedPurchaseFees, "lines");
  const guideTranslations = loadOrEmpty(
    guideTranslationPath || DEFAULT_DRAFT_GUIDE_TRANSLATIONS_PATH,
    readDraftGuideTranslations,
    "translations",
  );

  const sections = [
    { id: "team_profiles", surface: "/about", rows: teamProfileReviewRows(team, { now }) },
    { id: "area_guides", surface: "/{locale}/locations/{location}", rows: areaGuideReviewRows(areas, { now }) },
    { id: "financing_partners", surface: "/{locale}/start (financing step)", rows: financingPartnerReviewRows(financing, { now }) },
    { id: "purchase_fees", surface: "/{locale}/properties/{id} (cost estimator)", rows: purchaseFeeReviewRows(fees, { now }) },
    // Drafted buyer-guide copy for the locales that have none. Every row here
    // is blocked on translation_not_approved by construction; the section
    // exists so the drafts reach a translator instead of sitting unread.
    { id: "guide_translations", surface: "/{locale}/guides/{guide}", rows: guideTranslationReviewRows(guideTranslations, { now }) },
  ].map((section) => ({
    ...section,
    publish_requirement: PUBLISH_REQUIREMENTS[section.id],
    total: section.rows.length,
    publishable: section.rows.filter((row) => row.publishable).length,
    blocked: section.rows.filter((row) => !row.publishable).length,
  }));

  return {
    kind: "admin_approved_content",
    generated_at: now,
    summary: {
      total: sections.reduce((sum, section) => sum + section.total, 0),
      publishable: sections.reduce((sum, section) => sum + section.publishable, 0),
      blocked: sections.reduce((sum, section) => sum + section.blocked, 0),
    },
    sections,
    // The estimator's own readiness, per buyer scope, so the screen can show
    // the cost estimator as blocked without recomputing the rule.
    purchase_fee_table: purchaseFeeTableStatus(fees, { now }),
  };
}
