import { z } from "zod";
import {
  areaBases,
  factStates,
  listingPurposes,
  propertyTypes,
  sourceClasses,
} from "@/domain/facts";

export const draftSchema = z.object({
  // Native O12 wrapping fields can submit hard breaks without JavaScript. Normalize before
  // validation so storage, publication and the command's idempotency hash share one title.
  title: z
    .string()
    .transform((value) => value.replace(/[\s\u0085]+/g, " "))
    .pipe(z.string().trim().max(180)),
  description: z.string().trim().max(12_000),
  // Private opt-in intake source; never copied into public listing text.
  brokerNote: z.string().max(4000).default(""),
  priceState: z.enum(factStates),
  price: z.string().trim().max(160),
  areaState: z.enum(factStates),
  area: z.string().trim().max(160),
  areaBasis: z.enum(areaBases),
  bedroomsState: z.enum(factStates),
  bedrooms: z.string().trim().max(160),
  sourceReference: z.string().trim().min(1).max(1000),
  sourceClass: z.enum(sourceClasses),
  sourceLanguage: z.enum(["bg", "en", "ru", "de", "nl", "el", "he"]),
});
export type ListingDraft = z.infer<typeof draftSchema>;

// O12: incomplete provenance may be kept privately. Freezing still parses draftSchema and
// requires the original source/area prerequisites before creating reviewable revisions.
export const savedDraftSchema = draftSchema.extend({
  areaBasis: z.union([z.enum(areaBases), z.literal("")]),
  sourceReference: z.string().trim().max(1000),
  sourceClass: z.union([z.enum(sourceClasses), z.literal("")]),
  sourceLanguage: z.union([draftSchema.shape.sourceLanguage, z.literal("")]),
});
export type SavedListingDraft = z.infer<typeof savedDraftSchema>;

// A broker decision belongs to one Save command, never to the mutable draft.
export const priceDecisionSchema = z
  .object({
    kind: z.literal("retain_unknown"),
    sourceRevisionId: z.uuid(),
  })
  .strict();
export type PriceDecision = z.infer<typeof priceDecisionSchema>;

export const emptyDraft: ListingDraft = {
  title: "",
  description: "",
  brokerNote: "",
  priceState: "unknown",
  price: "",
  areaState: "unknown",
  area: "",
  areaBasis: "living",
  bedroomsState: "unknown",
  bedrooms: "",
  sourceReference: "",
  sourceClass: "source_supplied",
  sourceLanguage: "bg",
};
export const createListingSchema = z.object({
  propertyType: z.enum(propertyTypes),
  purpose: z.enum(listingPurposes),
  country: z.enum(["BG", "GR"]),
  region: z.string().trim().min(1).max(150),
  settlement: z.string().trim().min(1).max(150),
  exactAddress: z.string().trim().max(500),
  draft: draftSchema,
});
export type CreateListing = z.infer<typeof createListingSchema>;
