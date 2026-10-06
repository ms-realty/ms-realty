import { z } from "zod";
import {
  areaBases,
  factStates,
  listingPurposes,
  propertyTypes,
  sourceClasses,
} from "@/domain/facts";

export const draftSchema = z.object({
  title: z.string().trim().max(180),
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
