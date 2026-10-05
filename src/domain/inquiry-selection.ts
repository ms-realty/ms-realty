// The ordered public context of one comparison inquiry. No selection is ever silently reduced.
import { z } from "zod";
import { type PublicLocale, parseReference, publicLocales } from "./ids";

export const selectionJsonLimit = 1000;
const listingReferenceSchema = z
  .string()
  .max(20)
  .refine((value) => {
    const parsed = parseReference(value);
    return parsed?.kind === "listing" && parsed.reference === value;
  }, "invalid_reference");
/** Navigation only: these references do not become subjects of an individual inquiry. */
export const comparisonReferencesSchema = z
  .array(listingReferenceSchema)
  .min(1, "required")
  .max(3, "too_many")
  .refine((items) => new Set(items).size === items.length, "duplicate_reference");
export function parseComparisonReferences(value: string) {
  if (value.length > 62) return null;
  const result = comparisonReferencesSchema.safeParse(value.split(","));
  return result.success ? result.data : null;
}
export const selectedListingsSchema = z
  .array(
    z
      .object({
        reference: listingReferenceSchema,
        observedManifestId: z.uuid(),
      })
      .strict(),
  )
  .min(1, "required")
  .max(3, "too_many")
  .refine(
    (items) => new Set(items.map((item) => item.reference)).size === items.length,
    "duplicate_reference",
  );
export type SelectedListing = z.infer<typeof selectedListingsSchema>[number];

/** Public identity saved at submission; never refreshed from a later publication. */
export const inquiryListingReceiptSchema = z.object({
  reference: listingReferenceSchema,
  title: z.string().min(1).nullable(),
  locale: z.enum(publicLocales).nullable(),
});
export type InquiryListingReceipt = z.infer<typeof inquiryListingReceiptSchema>;

/** Invalid or empty JSON is distinct from an absent optional selection. */
export function parseSelectedListingsJson(value: string) {
  if (value.length > selectionJsonLimit) return null;
  try {
    const parsed = selectedListingsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function comparisonReturnHref(locale: PublicLocale, references: readonly string[]) {
  return `/${locale}/compare?${new URLSearchParams({ references: references.join(",") })}`;
}
