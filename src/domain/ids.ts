// Identifiers, human references, locales and currencies (architecture §4, §4.2, §3.2). The
// tenant-specific values (prefixes, locales, currencies) live in src/config/tenant.ts and are
// re-exported here so the schema, the gateway and the application keep one import path.
import {
  type CurrencyCode,
  currencyCodes,
  currencyMinorDigits,
  listingReferenceMinDigits,
  type PublicLocale,
  publicLocales,
  referencePrefixes,
  type StaffLocale,
  sourceLocale,
  staffLocales,
} from "../config/tenant";

export {
  type CurrencyCode,
  currencyCodes,
  currencyMinorDigits,
  type PublicLocale,
  publicLocales,
  referencePrefixes,
  type StaffLocale,
  sourceLocale,
  staffLocales,
};

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

// Human references. Listings keep the legacy lot-number format (MS-00100) so every
// reference already in circulation stays valid; other records get a yearly sequence.
export type ReferenceKind = keyof typeof referencePrefixes;
export type HumanReference = Brand<string, "HumanReference">;

const listingReferencePattern = new RegExp(
  `^${referencePrefixes.listing}-\\d{${listingReferenceMinDigits},}$`,
);
const yearlyReferencePattern = /^([A-Z]{2})-(\d{4})-(\d{6,})$/;

export function formatListingReference(lotNumber: number): HumanReference {
  if (!Number.isSafeInteger(lotNumber) || lotNumber < 1) {
    throw new Error(`Invalid lot number: ${lotNumber}`);
  }
  const digits = String(lotNumber).padStart(listingReferenceMinDigits, "0");
  return `${referencePrefixes.listing}-${digits}` as HumanReference;
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
export function isPublicLocale(value: string): value is PublicLocale {
  return (publicLocales as readonly string[]).includes(value);
}

// ISO 4217. Bulgaria adopted the euro on 2026-01-01; BGN stays for historical amounts.
export function isCurrencyCode(value: string): value is CurrencyCode {
  return (currencyCodes as readonly string[]).includes(value);
}
