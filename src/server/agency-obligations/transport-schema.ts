// B10 / AT10 / AT11: the HTTP contract uses the command parsers used by native actions.
import "server-only";
import { z } from "zod";
import { type AgencyCommand, agencyCommands } from "@/features/agency-obligations/contract";
import { photographyRequestSchema } from "../appointments/service";
import { partnerTermsDecisionSchema, partnerTermsSaveSchema } from "./partner-terms";
import {
  caseReviewConsentSchema,
  caseReviewDocumentConsentSchema,
  caseReviewSaveSchema,
  caseReviewVerifySchema,
} from "./reviews";

export const agencyCommandSchema = z.enum(
  Object.keys(agencyCommands) as [AgencyCommand, ...AgencyCommand[]],
);
export const agencyCommandSchemas = {
  partnerSave: partnerTermsSaveSchema,
  partnerDecision: partnerTermsDecisionSchema,
  reviewSave: caseReviewSaveSchema,
  reviewDocumentConsent: caseReviewDocumentConsentSchema,
  reviewVerify: caseReviewVerifySchema,
  clientConsent: caseReviewConsentSchema,
  photography: photographyRequestSchema,
} satisfies Record<AgencyCommand, z.ZodType>;

export const agencyRequestSchema = z.union(
  Object.entries(agencyCommandSchemas).map(([command, schema]) => schema.describe(command)),
);
const record = { id: z.uuid(), version: z.int().positive() };
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const agencyResponseSchema = z.object({
  operationId: z.uuid(),
  replayed: z.boolean(),
  outcome: z.union([
    z.object({ ...record, termsHash: hash }),
    z.object({ ...record, bindingHash: hash }),
    z.object({ ...record, consentState: z.enum(["granted", "refused", "withdrawn"]) }),
    z.object({ ...record, reference: z.string(), recordedAt: z.iso.datetime() }),
  ]),
});
