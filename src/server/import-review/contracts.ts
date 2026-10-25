import { z } from "zod";
import { areaBases, listingPurposes, propertyTypes } from "@/domain/facts";
import type { ColumnMapping, ImportField, PreviewRow } from "./csv";

/** Explicit interpretation, displayed before review. No source currency/location is inferred. */
export const importContextSchema = z
  .object({
    country: z.enum(["BG", "GR"]),
    region: z.string().trim().min(1).max(150),
    propertyType: z.enum(propertyTypes),
    purpose: z.enum(listingPurposes),
    areaBasis: z.enum(areaBases),
    sourceLanguage: z.enum(["bg", "en", "ru", "de", "nl", "el", "he"]),
  })
  .strict();
export type ImportContext = z.infer<typeof importContextSchema>;
export const choiceFields = ["title", "price", "area", "bedrooms", "sourceUrl"] as const;
export type ChoiceField = (typeof choiceFields)[number];
export type FieldChoice = "keep" | "source";
export interface ImportSelection {
  number: number;
  choices: Partial<Record<ChoiceField, FieldChoice>>;
}
export const selectionSchema = z
  .array(
    z
      .object({
        number: z.number().int().min(2).max(501),
        choices: z
          .object({
            title: z.enum(["keep", "source"]).optional(),
            price: z.enum(["keep", "source"]).optional(),
            area: z.enum(["keep", "source"]).optional(),
            bedrooms: z.enum(["keep", "source"]).optional(),
            sourceUrl: z.enum(["keep", "source"]).optional(),
          })
          .strict(),
      })
      .strict(),
  )
  .min(1)
  .max(500);
export interface ImportFieldDiff {
  field: ImportField;
  current: string | null;
  incoming: string | null;
  proposed: string | null;
  decision: boolean;
}
export interface ImportRowView {
  number: number;
  reference: string;
  classification: "create" | "update_proposal" | "no_change" | "blocked" | "needs_review";
  issues: string[];
  values: PreviewRow["values"];
  fields: ImportFieldDiff[];
  targetVersion: number | null;
  resultVersion: number | null;
  receiptId: string | null;
  outcome: "pending" | "applied" | "skipped" | "failed";
  errorCode: string | null;
  selected: boolean;
  choices: ImportSelection["choices"];
  reversal: "reversed" | "blocked" | null;
  reversalCode: string | null;
}
export interface ImportReceipt {
  id: string;
  operationKey: string;
  version: number;
  reference: string;
  filename: string;
  digest: string;
  planDigest: string;
  selectionDigest: string | null;
  context: ImportContext;
  mapping: ColumnMapping;
  state: "review" | "ready" | "partial" | "completed" | "cancelled";
  rows: ImportRowView[];
}
