// Approved team profiles: the people behind MS Realty, for the about-and-team
// page.
//
// Trust is the thing a foreign buyer is actually shopping for, so this is
// exactly the surface where an invented name, an unlicensed claim, or a stock
// photo would do the most damage. A profile therefore publishes only under the
// same discipline as an approved guide: a named human approved that exact
// content, the approval is recorded, and any later edit invalidates it.
//
// The repository ships no real staff records. The seed carries example rows
// marked `example_record: true`, which can never publish; the about page
// renders a marked absence until a human approves real profiles.
import {
  APPROVAL_REASONS,
  approvalState,
  markedAbsence,
  normalizeApproval,
  optionalIsoDate,
  optionalText,
  readApprovedRecordFile,
  requireIsoDate,
  requireLocale,
  requireStringList,
  requireText,
  reviewRows,
  stableHash,
  writeApprovedRecordFile,
} from "./approved-records.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_TEAM_PROFILES_PATH = fromRoot("production", "data", "approved-team-profiles.json");

// Roles the agency actually staffs. An unknown role is a refusal, not a
// free-text badge that could imply a regulated qualification.
export const TEAM_PROFILE_ROLES = Object.freeze([
  "broker",
  "senior_broker",
  "office_manager",
  "managing_partner",
  "editor",
  "translator",
  "property_manager",
]);

export function readApprovedTeamProfiles(filePath = DEFAULT_APPROVED_TEAM_PROFILES_PATH) {
  return readApprovedRecordFile(filePath, { collection: "profiles" });
}

export function writeApprovedTeamProfiles(document, { filePath = DEFAULT_APPROVED_TEAM_PROFILES_PATH } = {}) {
  return writeApprovedRecordFile(document, { filePath });
}

// The exact fields a reviewer signs off on. Anything outside this projection
// (ordering hints, internal notes) may change without a re-approval.
export function teamProfileHashPayload(profile) {
  return {
    profile_key: profile.profile_key || "",
    locale: profile.locale || "",
    source_locale: profile.source_locale || "",
    source_document_id: profile.source_document_id || "",
    name: profile.name || "",
    role: profile.role || "",
    office: profile.office || "",
    languages: profile.languages || [],
    licence: profile.licence
      ? {
          reference: profile.licence.reference || "",
          authority: profile.licence.authority || "",
          verified_at: profile.licence.verified_at || "",
        }
      : null,
    photo: profile.photo ? { url: profile.photo.url || "", alt: profile.photo.alt || "", credit: profile.photo.credit || "" } : null,
    bio: profile.bio || "",
  };
}

export function teamProfileSourceHash(profile) {
  return stableHash(teamProfileHashPayload(profile));
}

function normalizeLicence(input, label) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return {
    reference: requireText(input.reference, `${label}.reference`, { max: 120 }),
    authority: requireText(input.authority, `${label}.authority`, { max: 200 }),
    verified_at: requireIsoDate(input.verified_at, `${label}.verified_at`),
  };
}

function normalizePhoto(input, label) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  const url = requireText(input.url, `${label}.url`, { max: 500 });
  // A same-origin asset path or an HTTPS URL. Never an http:// image, which a
  // browser would block on the HTTPS site anyway.
  if (!url.startsWith("/") && !url.startsWith("https://")) {
    throw new Error(`${label}.url must be a site-relative path or an HTTPS URL`);
  }
  return {
    url,
    // An unlabelled face is an accessibility failure on the one page whose
    // whole job is showing who you are dealing with.
    alt: requireText(input.alt, `${label}.alt`, { max: 300 }),
    credit: optionalText(input.credit, `${label}.credit`, { max: 200 }),
    approved: input.approved === true,
  };
}

export function normalizeTeamProfile(input = {}) {
  const label = `team profile ${String(input.id || input.profile_key || "").trim() || "(unnamed)"}`;
  const locale = requireLocale(input.locale, `${label}.locale`);
  const sourceLocale = requireLocale(input.source_locale, `${label}.source_locale`);
  const role = String(input.role ?? "").trim();
  if (!TEAM_PROFILE_ROLES.includes(role)) {
    throw new Error(`${label}.role must be one of: ${TEAM_PROFILE_ROLES.join(", ")}`);
  }
  const profile = {
    id: requireText(input.id, `${label}.id`, { max: 160 }),
    type: "team_profile",
    profile_key: requireText(input.profile_key, `${label}.profile_key`, { max: 120 }),
    locale,
    source_locale: sourceLocale,
    ...normalizeApproval(input, label),
    ...(input.source_document_id ? { source_document_id: requireText(input.source_document_id, `${label}.source_document_id`, { max: 160 }) } : {}),
    ...(input.human_translation_approved === true ? { human_translation_approved: true } : {}),
    name: requireText(input.name, `${label}.name`, { max: 160 }),
    role,
    office: requireText(input.office, `${label}.office`, { max: 160 }),
    languages: requireStringList(input.languages, `${label}.languages`, { max: 12 }).map((code) =>
      requireLocale(code, `${label}.languages`),
    ),
    licence: normalizeLicence(input.licence, `${label}.licence`),
    photo: normalizePhoto(input.photo, `${label}.photo`),
    bio: requireText(input.bio, `${label}.bio`, { max: 600 }),
    display_order: Number.isFinite(Number(input.display_order)) ? Number(input.display_order) : 100,
    last_verified_at: optionalIsoDate(input.last_verified_at, `${label}.last_verified_at`),
  };
  profile.source_hash = requireText(input.source_hash || teamProfileSourceHash(profile), `${label}.source_hash`, { max: 64 });
  return profile;
}

export function teamProfileApprovalState(profile, { now } = {}) {
  return approvalState(profile, { hashPayload: teamProfileHashPayload, now });
}

export function isPublishableTeamProfile(profile, { now } = {}) {
  return teamProfileApprovalState(profile, { now }).publishable;
}

// The public projection. A photo that was never approved is dropped rather
// than shown: the page says "photo pending", it does not borrow a face.
export function publicTeamProfile(profile) {
  return {
    profile_key: profile.profile_key,
    locale: profile.locale,
    name: profile.name,
    role: profile.role,
    office: profile.office,
    languages: [...profile.languages],
    bio: profile.bio,
    licence: profile.licence
      ? { reference: profile.licence.reference, authority: profile.licence.authority, verified_at: profile.licence.verified_at }
      : null,
    photo: profile.photo?.approved === true ? { url: profile.photo.url, alt: profile.photo.alt, credit: profile.photo.credit } : null,
    photo_available: profile.photo?.approved === true,
    reviewer: profile.reviewer,
    approved_at: profile.approved_at,
  };
}

// Profiles for one locale, falling back to the source locale only when that
// source-locale profile is itself approved. Never a machine translation.
export function publicTeamProfilesFor(document, localeCode, { now, sourceLocale = "bg" } = {}) {
  const profiles = (document?.profiles || []).filter((profile) => isPublishableTeamProfile(profile, { now }));
  const byKey = new Map();
  for (const profile of profiles) {
    const existing = byKey.get(profile.profile_key);
    const exact = profile.locale === localeCode;
    const fallback = profile.locale === sourceLocale;
    if (exact || (!existing && fallback)) {
      if (!existing || exact || existing.locale !== localeCode) byKey.set(profile.profile_key, profile);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
    .map(publicTeamProfile);
}

export function teamProfileReviewRows(document, { now } = {}) {
  return reviewRows(document?.profiles || [], {
    hashPayload: teamProfileHashPayload,
    now,
    describe: (profile) => ({
      profile_key: profile.profile_key,
      name: profile.name,
      role: profile.role,
      office: profile.office,
      photo_approved: profile.photo?.approved === true,
      licence_recorded: Boolean(profile.licence),
    }),
  });
}

export function teamAbsenceReason(document, localeCode, { now } = {}) {
  const rows = document?.profiles || [];
  if (!rows.length) return APPROVAL_REASONS.NOT_APPROVED;
  const states = rows.map((profile) => teamProfileApprovalState(profile, { now }));
  const stale = states.find((state) => state.reason === APPROVAL_REASONS.STALE);
  return stale ? APPROVAL_REASONS.STALE : states[0].reason || APPROVAL_REASONS.NOT_APPROVED;
}

export function teamAbsence(document, localeCode, { now } = {}) {
  return markedAbsence(teamAbsenceReason(document, localeCode, { now }), { locale: localeCode });
}

export function assertApprovedTeamProfiles(document) {
  if (!Array.isArray(document?.profiles)) throw new Error("Approved team profiles must contain a profiles array");
  const ids = new Set();
  for (const raw of document.profiles) {
    const profile = normalizeTeamProfile(raw);
    if (ids.has(profile.id)) throw new Error(`Team profile ids must be unique: ${profile.id}`);
    ids.add(profile.id);
    if (raw.source_hash && raw.source_hash !== teamProfileSourceHash(profile)) {
      throw new Error(`Team profile ${profile.id} source_hash does not cover its approved content`);
    }
    if (profile.status === "approved" && profile.example_record === true) {
      throw new Error(`Team profile ${profile.id} cannot be both an example and approved`);
    }
  }
  return true;
}
