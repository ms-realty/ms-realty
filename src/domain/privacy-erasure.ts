// O26 / AT45 / UX23: reviewed optional copies, never an inferred legal deletion policy.
import { z } from "zod";

export const erasureCategories = [
  "optional_processing",
  "contact_preferences",
  "matching_aliases",
  "optional_search_criteria",
  "optional_contacts",
  "client_profile_copies",
  "client_access",
] as const;
export type ErasureCategory = (typeof erasureCategories)[number];
export const erasureDispositions = [
  "restrict_processing",
  "erase_optional_copy",
  "revoke_client_access",
  "retain_restricted",
  "hold_unknown",
] as const;
export const erasureDecision = z
  .object({
    category: z.enum(erasureCategories),
    disposition: z.enum(erasureDispositions),
    classification: z.enum([
      "optional_only",
      "account_credentials",
      "retained_business",
      "unknown",
    ]),
    sourceKeys: z.array(z.string().min(1).max(150)).max(500),
    evidenceReference: z.string().trim().min(10).max(1500),
  })
  .strict();
export type ErasureSourceDecision = z.infer<typeof erasureDecision>;
export const optionalProcessingPurposes = ["search_alerts", "marketing"] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const privacySafetyEffect = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("privacy_restriction_v1"),
      partyId: z.uuid(),
      requestId: z.uuid(),
      purposes: z.array(z.enum(optionalProcessingPurposes)).min(1).max(2),
      clientIds: z.array(z.uuid()).max(500),
      erasePreferences: z.boolean(),
      eraseAliases: z.boolean(),
      contactIds: z.array(z.uuid()).max(500),
      clientProfileIds: z.array(z.uuid()).max(500),
      searchSubscriptionIds: z.array(z.uuid()).max(500),
      inventoryDigest: digest,
    })
    .strict(),
  z
    .object({
      kind: z.literal("subscription_withdrawal_v1"),
      partyId: z.uuid(),
      subscriptionIds: z.array(z.uuid()).min(1).max(500),
    })
    .strict(),
]);
export type PrivacySafetyEffect = z.infer<typeof privacySafetyEffect>;

export interface ErasureSource {
  key: string;
  category: ErasureCategory;
  digest: string;
  eligible: boolean;
}
export interface ErasureInventory {
  kind: "privacy_erasure_inventory_v1";
  requestId: string;
  requestVersion: number;
  partyId: string;
  reviewerId: string;
  reviewerSessionId: string;
  authorityDigest: string;
  sources: ErasureSource[];
  /** Boolean/hash only: never reveal a restricted retention record to the operator. */
  retentionHold: boolean;
  businessDependencies: boolean;
  dependencyDigest: string;
  policy: unknown;
}
export const safetyTailEntry = z
  .object({
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    id: z.uuid(),
    operationId: z.uuid(),
    partyId: z.uuid(),
    requestId: z.uuid().nullable(),
    requestHash: digest,
    review: z.unknown(),
    effect: privacySafetyEffect,
    previousDigest: digest,
    digest,
    recordedAt: z.iso.datetime(),
  })
  .strict();
export type SafetyTailEntry = z.infer<typeof safetyTailEntry>;
export const syntheticPrivacyTail = z
  .object({
    kind: z.literal("synthetic_privacy_safety_tail_v1"),
    scope: z.literal("privacy_decisions_only"),
    restoreId: z.uuid(),
    snapshotDigest: digest,
    snapshotSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    snapshotLedgerDigest: digest,
    throughSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    headDigest: digest,
    entries: z.array(safetyTailEntry).max(1000),
  })
  .strict();
export type SyntheticPrivacyTail = z.infer<typeof syntheticPrivacyTail>;
export const syntheticPrivacyCheckpoint = z
  .object({
    kind: z.literal("synthetic_privacy_checkpoint_v1"),
    restoreId: z.uuid(),
    snapshotDigest: digest,
    throughSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    headDigest: digest,
  })
  .strict();
export const emptySafetyDigest = "0".repeat(64);

export type PrivacyPropagationBoundary =
  | "application"
  | "business_and_history"
  | "private_files"
  | "provider_data"
  | "independent_archive"
  | "restore_reapplication";
export type PrivacyPropagationState = "applied" | "held" | "unsupported";
