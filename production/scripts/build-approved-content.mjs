// Build the approved-content artifacts for the public surfaces that have no
// source of truth yet: team profiles, area guides, financing partners, and the
// purchase fee table.
//
// Two jobs:
//   1. Project area guides out of the already-approved location guides in
//      production/data/approved-cms-content.json. The projected sentence, its
//      claim id, its official source, its reviewer and its approval date are
//      carried across unchanged, so the human approval still covers the exact
//      words that reach a location page. A guide whose fact-to-claim mapping is
//      ambiguous is skipped rather than guessed.
//   2. Normalize the three authored files and recompute every source_hash, so
//      an edited record stops publishing until a human re-approves it.
import fs from "node:fs";
import { isPublishableGuide, readApprovedCmsContent } from "../lib/approved-content.mjs";
import {
  DEFAULT_APPROVED_AREA_GUIDES_PATH,
  areaGuideSourceHash,
  assertApprovedAreaGuides,
  normalizeAreaGuide,
  writeApprovedAreaGuides,
} from "../lib/area-guides.mjs";
import {
  DEFAULT_APPROVED_TEAM_PROFILES_PATH,
  assertApprovedTeamProfiles,
  normalizeTeamProfile,
  readApprovedTeamProfiles,
  teamProfileSourceHash,
  writeApprovedTeamProfiles,
} from "../lib/team-profiles.mjs";
import {
  DEFAULT_APPROVED_FINANCING_PARTNERS_PATH,
  assertApprovedFinancingPartners,
  financingPartnerSourceHash,
  normalizeFinancingPartner,
  readApprovedFinancingPartners,
  writeApprovedFinancingPartners,
} from "../lib/financing-partners.mjs";
import {
  DEFAULT_APPROVED_PURCHASE_FEES_PATH,
  assertApprovedPurchaseFees,
  normalizePurchaseFeeLine,
  purchaseFeeLineSourceHash,
  readApprovedPurchaseFees,
  writeApprovedPurchaseFees,
} from "../lib/purchase-fees.mjs";

// Which approved claim belongs in which area-guide section. A claim id that is
// not listed here is not projected: the section assignment is editorial
// routing, and routing an unknown claim would be a guess.
const SECTION_CLAIMS = Object.freeze({
  "hotovo-locality": "what_it_is",
  "petrich-municipality-geography": "what_it_is",
});

const GENERATED_AT = process.env.MS_REALTY_GENERATED_AT || "2026-08-23T00:00:00Z";

function projectedAreaGuides(content) {
  const projected = [];
  const skipped = [];
  for (const doc of content.documents || []) {
    if (!doc.location) continue;
    if (!isPublishableGuide(doc)) {
      skipped.push({ id: doc.id, reason: "guide_not_publishable" });
      continue;
    }
    const facts = doc.facts || [];
    const sources = doc.sources || [];
    const claimIds = sources.flatMap((source) => source.claim_ids || []);
    // Only an unambiguous one-fact, one-claim guide can be projected without
    // guessing which sentence a source backs.
    if (facts.length !== 1 || sources.length !== 1 || claimIds.length !== 1) {
      skipped.push({ id: doc.id, reason: "ambiguous_fact_to_claim_mapping" });
      continue;
    }
    const section = SECTION_CLAIMS[claimIds[0]];
    if (!section) {
      skipped.push({ id: doc.id, reason: "claim_not_mapped_to_an_area_guide_section" });
      continue;
    }
    projected.push(
      normalizeAreaGuide({
        id: `${doc.location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${doc.locale}`,
        area_key: doc.location,
        locale: doc.locale,
        source_locale: doc.source_locale,
        status: "approved",
        human_approved: true,
        reviewer: doc.reviewer,
        approved_at: doc.approved_at,
        derived_from_document_id: doc.id,
        title: doc.title,
        sea_access: false,
        sections: { [section]: [{ text: facts[0], claim_id: claimIds[0], source_id: sources[0].id }] },
        sources,
      }),
    );
  }
  return { projected, skipped };
}

function existingAreaGuideDocument() {
  if (!fs.existsSync(DEFAULT_APPROVED_AREA_GUIDES_PATH)) {
    return {
      artifact_id: "approved-area-guides-20260823",
      purpose:
        "Human-approved area copy for the public location pages, keyed by the same location value the listings carry. Projected rows carry the reviewer, approval date and official source of the approved CMS guide they came from.",
      publishing_note:
        "Run production/scripts/build-approved-content.mjs to reproject. Hand-authored guides (no derived_from_document_id) are preserved. An inland area may never be described as a sea destination; production/lib/area-guides.mjs refuses that in validation.",
      guides: [],
    };
  }
  return JSON.parse(fs.readFileSync(DEFAULT_APPROVED_AREA_GUIDES_PATH, "utf8"));
}

function rehash(records, { normalize, hash }) {
  return records.map((record) => {
    const normalized = normalize(record);
    return { ...normalized, source_hash: hash(normalized) };
  });
}

const content = readApprovedCmsContent();
const { projected, skipped } = projectedAreaGuides(content);
const areaDocument = existingAreaGuideDocument();
// Hand-authored guides survive a reprojection; projected ones are replaced.
const handAuthored = (areaDocument.guides || []).filter((guide) => !guide.derived_from_document_id);
const areaGuides = rehash([...projected, ...handAuthored], { normalize: normalizeAreaGuide, hash: areaGuideSourceHash }).sort(
  (a, b) => a.id.localeCompare(b.id),
);
assertApprovedAreaGuides({ guides: areaGuides });
const { outPath: areaPath } = writeApprovedAreaGuides({ ...areaDocument, generated_at: GENERATED_AT, guides: areaGuides });

const teamDocument = readApprovedTeamProfiles();
const profiles = rehash(teamDocument.profiles, { normalize: normalizeTeamProfile, hash: teamProfileSourceHash });
assertApprovedTeamProfiles({ profiles });
const { outPath: teamPath } = writeApprovedTeamProfiles({ ...teamDocument, profiles });

const financingDocument = readApprovedFinancingPartners();
const partners = rehash(financingDocument.partners, {
  normalize: normalizeFinancingPartner,
  hash: financingPartnerSourceHash,
});
assertApprovedFinancingPartners({ partners });
const { outPath: financingPath } = writeApprovedFinancingPartners({ ...financingDocument, partners });

const feeDocument = readApprovedPurchaseFees();
const lines = rehash(feeDocument.lines, { normalize: normalizePurchaseFeeLine, hash: purchaseFeeLineSourceHash });
assertApprovedPurchaseFees({ lines });
const { outPath: feePath } = writeApprovedPurchaseFees({ ...feeDocument, lines });

console.log(`Wrote ${areaGuides.length} approved area guides to ${areaPath}`);
for (const row of skipped) console.log(`  skipped ${row.id}: ${row.reason}`);
console.log(`Wrote ${profiles.length} team profiles to ${teamPath}`);
console.log(`Wrote ${partners.length} financing partners to ${financingPath}`);
console.log(`Wrote ${lines.length} purchase fee lines to ${feePath}`);
