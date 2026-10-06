import type { listingRevisions, propertyFacts } from "@/db/schema";
import {
  type AreaBasis,
  areaBases,
  type FactState,
  factStates,
  priceBases,
  pricePeriodByPurpose,
  type SourceClass,
  sourceClasses,
} from "@/domain/facts";
import type { ListingDraft } from "./contracts";

export type WorkingDraftRevision = Readonly<
  Pick<typeof listingRevisions.$inferSelect, "terms" | "sourceCopy">
>;
export type WorkingDraftFact = Readonly<
  Pick<
    typeof propertyFacts.$inferSelect,
    | "fieldKey"
    | "state"
    | "value"
    | "unit"
    | "basis"
    | "sourceClass"
    | "sourceReference"
    | "sourceLanguage"
  >
>;

/** An editor projection may need broker input before draftSchema will allow Save. */
export type WorkingDraft = Omit<ListingDraft, "areaBasis" | "sourceClass" | "sourceLanguage"> & {
  areaBasis: AreaBasis | "";
  sourceClass: SourceClass | "";
  sourceLanguage: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function nonempty(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}
function member<T extends string>(values: readonly T[], value: unknown): T | "" {
  return values.includes(value as T) ? (value as T) : "";
}

function editableFact(
  input: unknown,
  format: (value: unknown) => string | null,
): { state: FactState; value: string } {
  const fact = record(input);
  const state = member(factStates, fact.state);
  const unknown = { state: "unknown" as const, value: "" };
  if (!state) return unknown;
  if (state !== "known" && state !== "conflicting") return { state, value: "" };
  const values = state === "conflicting" ? fact.value : [fact.value];
  if (!Array.isArray(values) || (state === "conflicting" && values.length < 2)) return unknown;
  const formatted = values.map(format);
  return formatted.some((value) => value === null)
    ? unknown
    : { state, value: formatted.join("|") };
}

function priceText(value: unknown, purpose: unknown): string | null {
  const amount = record(value);
  if (
    amount.currency !== "EUR" ||
    typeof amount.amountMinor !== "number" ||
    !Number.isSafeInteger(amount.amountMinor) ||
    amount.amountMinor < 0 ||
    (amount.period !== "total" && amount.period !== "month") ||
    !member(priceBases, amount.basis) ||
    ((purpose === "sale" || purpose === "long_term_rent") &&
      amount.period !== pricePeriodByPurpose[purpose])
  ) {
    return null;
  }
  const minor = BigInt(amount.amountMinor);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

function scalarText(value: unknown, integer: boolean): string | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    (integer && !Number.isInteger(value)) ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value))
  ) {
    return null;
  }
  return String(value);
}

/**
 * Seed only when draftSchema rejects the stored draft. Pass the latest ListingRevision and
 * its own fact-revision rows, as returned by inventoryDetail. This never reads or writes a
 * database, changes its inputs, grants review, or promotes translations. Save still uses
 * draftSchema and saveListingDraft's version check.
 */
export function workingDraftFrom(
  revision: WorkingDraftRevision | null | undefined,
  facts: readonly WorkingDraftFact[],
): WorkingDraft {
  const terms = record(revision?.terms);
  const price = record(record(terms.facts).price);
  const copy = record(revision?.sourceCopy);
  const copyText = record(copy.text);
  const priceDraft = editableFact(price, (value) => priceText(value, terms.purpose));
  const areaFacts = facts.filter(
    (fact) => member(areaBases, fact.fieldKey.slice(5)) && fact.fieldKey.startsWith("area."),
  );
  // The editor carries one area. Two bases need a broker choice, never an arbitrary winner.
  const areaFact = areaFacts.length === 1 ? areaFacts[0] : undefined;
  const areaBasis = areaFact ? member(areaBases, areaFact.fieldKey.slice(5)) : "";
  const areaDraft = editableFact(areaFact, (value) => {
    const area = record(value);
    if (
      area.unit !== "m2" ||
      area.basis !== areaBasis ||
      (areaFact?.unit != null && areaFact.unit !== "m2") ||
      (areaFact?.basis != null && areaFact.basis !== areaBasis) ||
      typeof area.value !== "number" ||
      area.value <= 0
    ) {
      return null;
    }
    return scalarText(area.value, false);
  });
  const bedrooms = editableFact(
    facts.find((fact) => fact.fieldKey === "bedrooms"),
    (value) => scalarText(value, true),
  );

  const sources: readonly Record<string, unknown>[] = [price, ...facts];
  // One draft provenance cannot silently replace different recorded sources or review classes.
  const mixedProvenance = (["sourceReference", "sourceClass", "sourceLanguage"] as const).some(
    (key) => new Set(sources.map((fact) => nonempty(fact[key])).filter(Boolean)).size > 1,
  );
  const source =
    sources.find((fact) => nonempty(fact.sourceReference)) ??
    sources.find(
      (fact) => member(sourceClasses, fact.sourceClass) || nonempty(fact.sourceLanguage),
    );
  const legacyUrl = nonempty(copyText.sourceUrl);
  const sourceReference = nonempty(source?.sourceReference) || legacyUrl;
  const related = sourceReference
    ? sources.filter((fact) => nonempty(fact.sourceReference) === sourceReference)
    : [];
  // A BG working translation is not evidence that the original source was Bulgarian.
  const legacyLanguage =
    sourceReference && sourceReference === legacyUrl
      ? nonempty(record(copy.legacySource).locale) ||
        (copyText.origin === "legacy_source" ? nonempty(copy.locale) : "")
      : "";

  return {
    title: text(copyText.title),
    description: text(copyText.description),
    brokerNote: "",
    priceState: priceDraft.state,
    price: priceDraft.value,
    areaState: areaDraft.state,
    area: areaDraft.value,
    areaBasis,
    bedroomsState: bedrooms.state,
    bedrooms: bedrooms.value,
    sourceReference: mixedProvenance ? "" : sourceReference,
    sourceClass: mixedProvenance
      ? ""
      : member(sourceClasses, source?.sourceClass) ||
        member(
          sourceClasses,
          related.find((fact) => member(sourceClasses, fact.sourceClass))?.sourceClass,
        ),
    sourceLanguage: mixedProvenance
      ? ""
      : nonempty(source?.sourceLanguage) ||
        nonempty(related.find((fact) => nonempty(fact.sourceLanguage))?.sourceLanguage) ||
        legacyLanguage,
  };
}
