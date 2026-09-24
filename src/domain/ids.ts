// Identifiers, human references, locales and currencies (spec §04.1, §18.2).

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export const entityKinds = [
  "staff_account",
  "client_account",
  "person",
  "organization",
  "property",
  "listing",
  "listing_version",
  "media_asset",
  "inquiry",
  "case",
  "match",
  "shortlist",
  "saved_search",
  "appointment",
  "message",
  "document",
  "proposal",
  "task",
  "approval",
  "publication_release",
  "translation",
  "content_page",
  "service_agreement",
  "service_request",
  "reservation",
  "import_batch",
  "operation",
] as const;
export type EntityKind = (typeof entityKinds)[number];

/** A uuid primary key that cannot be passed where another entity's id is expected. */
export type Id<K extends EntityKind> = Brand<string, K>;

export type ListingId = Id<"listing">;
export type PropertyId = Id<"property">;
export type CaseId = Id<"case">;
export type InquiryId = Id<"inquiry">;
export type StaffAccountId = Id<"staff_account">;
export type ClientAccountId = Id<"client_account">;
export type PersonId = Id<"person">;
export type OperationId = Id<"operation">;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function asId<K extends EntityKind>(_kind: K, value: string): Id<K> {
  if (!isUuid(value)) throw new Error(`Invalid ${_kind} id: ${value}`);
  return value as Id<K>;
}

// Human references. Listings keep the legacy lot-number format (MS-00100) so every
// reference already in circulation stays valid; other records get a yearly sequence.
export const referencePrefixes = {
  listing: "MS",
  property: "PR",
  inquiry: "RQ",
  case: "CS",
  appointment: "AP",
  proposal: "PP",
  document: "DC",
  publication_release: "RL",
  service_agreement: "SA",
  service_request: "SR",
  reservation: "RS",
  import_batch: "IM",
} as const;
export type ReferenceKind = keyof typeof referencePrefixes;
export type HumanReference = Brand<string, "HumanReference">;

const listingReferencePattern = /^MS-\d{5,}$/;
const yearlyReferencePattern = /^([A-Z]{2})-(\d{4})-(\d{6,})$/;

export function formatListingReference(lotNumber: number): HumanReference {
  if (!Number.isSafeInteger(lotNumber) || lotNumber < 1) {
    throw new Error(`Invalid lot number: ${lotNumber}`);
  }
  return `MS-${String(lotNumber).padStart(5, "0")}` as HumanReference;
}

export function formatReference(
  kind: Exclude<ReferenceKind, "listing">,
  year: number,
  sequence: number,
): HumanReference {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }
  return `${referencePrefixes[kind]}-${year}-${String(sequence).padStart(6, "0")}` as HumanReference;
}

export function parseReference(
  value: string,
): { kind: ReferenceKind; reference: HumanReference } | null {
  const normalized = value.trim().toUpperCase();
  if (listingReferencePattern.test(normalized)) {
    return { kind: "listing", reference: normalized as HumanReference };
  }
  const match = yearlyReferencePattern.exec(normalized);
  if (!match) return null;
  const kind = (Object.keys(referencePrefixes) as ReferenceKind[]).find(
    (k) => k !== "listing" && referencePrefixes[k] === match[1],
  );
  return kind ? { kind, reference: normalized as HumanReference } : null;
}

// Locales (AD9). Bulgarian is the editorial source; Hebrew is right-to-left.
export const publicLocales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
export type PublicLocale = (typeof publicLocales)[number];
export const staffLocales = ["bg", "ru", "en"] as const;
export type StaffLocale = (typeof staffLocales)[number];
export const sourceLocale = "bg" satisfies PublicLocale;

export function isPublicLocale(value: string): value is PublicLocale {
  return (publicLocales as readonly string[]).includes(value);
}

// ISO 4217. Bulgaria adopted the euro on 2026-01-01; BGN stays for historical amounts.
export const currencyCodes = ["EUR", "BGN", "USD", "GBP"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];
export const currencyMinorDigits: Record<CurrencyCode, number> = { EUR: 2, BGN: 2, USD: 2, GBP: 2 };

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (currencyCodes as readonly string[]).includes(value);
}
