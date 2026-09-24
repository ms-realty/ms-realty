// Enumerations for records without a state machine of their own. Kept here so the database
// schema derives its enums from the domain and the two cannot drift.

/** Match between a case and a listing (spec F21, A49). */
export const matchGroups = ["exact", "alternative"] as const;
export const matchStates = ["proposed", "shared", "dismissed", "feedback_received"] as const;

/** Requirement brief items (spec §04). */
export const requirementItemKinds = ["hard_constraint", "preference", "open_question"] as const;
export const requirementOrigins = ["client_stated", "broker_interpretation"] as const;

/** Shortlist decisions (spec F04). */
export const shortlistOpinions = ["interested", "question", "maybe", "no"] as const;
export const shortlistParticipantRoles = ["owner", "collaborator"] as const;

/** Saved-search alerts (spec F05, A14, A15). */
export const alertFrequencies = ["immediate", "daily", "weekly", "paused"] as const;
export const alertSubscriptionStates = [
  "pending_verification",
  "active",
  "paused",
  "unsubscribed",
] as const;

/** Where an inquiry came from. */
export const inquirySources = [
  "website",
  "phone",
  "email",
  "messenger",
  "walk_in",
  "import",
] as const;

/** Content pages share the listing approval and translation model (AD3). */
export const contentPageKinds = ["area", "guide", "service", "team_member", "help"] as const;

/** Legacy URL decisions recorded in data/legacy/url-decisions.json. */
export const legacyDomains = ["makler-realty.com", "makler-realty.ru"] as const;
export const legacyUrlDecisions = ["retain_200", "redirect_301", "approved_410"] as const;

/** Import pipeline (spec F32, A71, A72). */
export const importRowClassifications = [
  "create",
  "update_proposal",
  "no_change",
  "blocked",
  "needs_review",
] as const;
export const importBatchModes = ["dry_run", "apply"] as const;
export const importBatchStates = [
  "staged",
  "validated",
  "applying",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export const importRowOutcomes = ["pending", "applied", "skipped", "failed"] as const;

/** Geography (spec F02, §18.2). */
export const placeLevels = [
  "country",
  "district",
  "municipality",
  "settlement",
  "neighborhood",
] as const;
export const placeAliasKinds = ["official", "local", "transliteration", "legacy_spelling"] as const;

/** Authenticated principals. */
export const accountKinds = ["staff", "client"] as const;
export const signInTokenPurposes = ["sign_in", "invitation"] as const;
