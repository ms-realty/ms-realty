import type { ListingCard } from "@/server/listings/view-models";

export type SavedProperty =
  | { reference: string; status: "listing"; listing: ListingCard }
  | { reference: string; status: "unavailable" | "error" };

/** The public read accepts only the bounded references stored by LocalActions. No silent drops. */
export function validSavedReferences(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    new Set(value).size === value.length &&
    value.every(
      (reference) =>
        typeof reference === "string" && reference.length <= 64 && /^MS-\d{5,}$/.test(reference),
    )
  );
}

export type LoadSavedProperties = (references: readonly string[]) => Promise<SavedProperty[]>;
