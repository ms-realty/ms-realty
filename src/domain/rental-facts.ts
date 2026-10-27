// F26 rental terms belong to one listing revision, with the same absence/provenance rules.
import { z } from "zod";
import { factStates, sourceClasses } from "./facts";

export const rentalFactKeys = [
  "rental.deposit",
  "rental.recurring_charges",
  "rental.available_from",
  "rental.restrictions",
] as const;
export type RentalFactKey = (typeof rentalFactKeys)[number];
const amount = z.object({
  amountMinor: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("EUR"),
});
export const rentalValueSchemas = {
  "rental.deposit": amount.extend({ period: z.literal("total") }),
  "rental.recurring_charges": amount.extend({
    period: z.literal("month"),
    inclusions: z.array(z.string().min(1).max(300)).max(20),
  }),
  "rental.available_from": z.iso.date(),
  "rental.restrictions": z.string().trim().min(1).max(2000),
} as const;
export type RentalFactValue<K extends RentalFactKey> = z.infer<(typeof rentalValueSchemas)[K]>;
const provenance = z.object({
  sourceClass: z.enum(sourceClasses).optional(),
  sourceReference: z.string().optional(),
  sourceLanguage: z.string().optional(),
});
const recorded = provenance.extend({ state: z.enum(factStates), value: z.unknown().optional() });

/** Never invent zero charges, a date, or agreement to restrictions from a missing source. */
export function rentalFact<K extends RentalFactKey>(terms: unknown, key: K) {
  const root = z
    .object({ purpose: z.literal("long_term_rent"), facts: z.record(z.string(), z.unknown()) })
    .safeParse(terms);
  const parsed = recorded.safeParse(root.success ? root.data.facts[key] : undefined);
  if (!parsed.success)
    return {
      state: "unknown" as const,
      values: [] as RentalFactValue<K>[],
      readable: true,
      provenance: {},
    };
  const row = parsed.data;
  const source = provenance.parse(row);
  if (row.state !== "known" && row.state !== "conflicting")
    return {
      state: row.state,
      values: [] as RentalFactValue<K>[],
      readable: true,
      provenance: source,
    };
  const values = (
    row.state === "conflicting"
      ? z.array(rentalValueSchemas[key]).min(2)
      : z.array(rentalValueSchemas[key]).length(1)
  ).safeParse(row.state === "conflicting" ? row.value : [row.value]);
  return {
    state: row.state,
    values: values.success ? (values.data as RentalFactValue<K>[]) : [],
    readable: values.success,
    provenance: source,
  };
}
