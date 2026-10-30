// C18/O26 · AT45. A closed category vocabulary; forms cannot erase unknown scope.
import { z } from "zod";

export const privacyExportCategories = [
  "personal_activity",
  "joint_records_and_received_communications",
  "private_files",
  "restricted_material_and_security_credentials",
  "additional_requested_material",
] as const;
export type PrivacyExportCategory = (typeof privacyExportCategories)[number];
export const privacyExportDispositions = [
  "disclosed",
  "none",
  "withheld",
  "held",
  "unsupported",
] as const;
export const privacyExportScope = z.enum(["listed_categories", "additional_material"]);
export const privacyExportBasis = z.enum([
  "no_sources",
  "reviewed_disclosure",
  "other_party_confidentiality",
  "outside_person_scope",
  "security_boundary",
  "pending_review",
]);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const privacyExportSource = z
  .object({
    key: z.string().min(1).max(100),
    kind: z.enum([
      "own_activity",
      "case_bundle",
      "agency_record",
      "appointment_bundle",
      "document",
      "security_boundary",
    ]),
    id: z.uuid().optional(),
    revision: z.int().positive().optional(),
    digest,
  })
  .strict();
export const privacyExportBucket = z
  .object({
    category: z.enum(privacyExportCategories),
    blocked: z.boolean(),
    sources: z.array(privacyExportSource).max(100),
  })
  .strict();
export const privacyExportInventory = z
  .object({
    version: z.literal(1),
    requestVersion: z.int().positive(),
    recipientId: z.uuid(),
    scopeDigest: digest,
    ownSourceDigest: digest,
    categories: z.array(privacyExportBucket).length(privacyExportCategories.length),
  })
  .strict();
export const privacyExportDecision = z
  .object({
    category: z.enum(privacyExportCategories),
    disposition: z.enum(privacyExportDispositions),
    sourceKeys: z.array(z.string().min(1).max(100)).max(100),
    evidence: z
      .array(
        z.object({ sourceKey: z.string().min(1).max(100), documentVersionId: z.uuid() }).strict(),
      )
      .max(100),
    basis: privacyExportBasis,
    policyReference: z.string().trim().min(5).max(500),
    evidenceReference: z.string().trim().min(10).max(1000),
    reviewedById: z.uuid(),
    reviewedAt: z.iso.datetime(),
  })
  .strict();
export const privacyExportReview = z
  .object({
    inventory: privacyExportInventory,
    inventoriedById: z.uuid(),
    decisions: z.array(privacyExportDecision).max(privacyExportCategories.length),
  })
  .strict();
export type PrivacyExportInventory = z.infer<typeof privacyExportInventory>;
export type PrivacyExportReview = z.infer<typeof privacyExportReview>;
export type PrivacyExportDecision = z.infer<typeof privacyExportDecision>;
export type PrivacyExportSource = z.infer<typeof privacyExportSource>;
