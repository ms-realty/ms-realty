import { z } from "zod";
import { propertyTypes } from "./facts";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

/** Initial self-declaration only; never an ownership assessment or a public property fact. */
export const ownerInquirySchema = z
  .object({
    version: z.literal(1),
    provenance: z.literal("self_declared"),
    locality: optionalText(160),
    propertyType: z.enum([...propertyTypes, "unknown"]).optional(),
    transaction: z.enum(["sale", "long_term_rent", "unknown"]).optional(),
    documentArea: optionalText(32).refine(
      (value) =>
        value === undefined ||
        (/^\d{1,7}([.,]\d{1,4})?$/.test(value) && Number(value.replace(",", ".")) > 0),
      "invalid_area",
    ),
    relationship: z.enum(["owner", "co_owner", "representative", "other", "unknown"]).optional(),
    propertyStatus: optionalText(200),
    documentSource: optionalText(200),
  })
  .strict();

export type OwnerInquiry = z.output<typeof ownerInquirySchema>;
export const ownerInquiryReceiptSchema = ownerInquirySchema.omit({
  locality: true,
  propertyStatus: true,
  documentSource: true,
});

/** Receipt does not reveal broad location, free-text source notes or contact information. */
export function ownerInquiryReceipt(value: unknown) {
  const parsed = ownerInquirySchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { version, provenance, propertyType, transaction, documentArea, relationship } =
    parsed.data;
  return { version, provenance, propertyType, transaction, documentArea, relationship };
}
