// Which facts a listing needs before it can enter editorial review, and which unknowns a
// visitor should be told to confirm (spec §18.1, §07.4 "needs facts", F03 "What to confirm").
// Unknown stays unknown: it blocks review only where publishing it would mislead (price,
// location). A decided value carried over from the legacy import needs a person to confirm it.
import type { FactState, PropertyType, SourceClass } from "./facts";

export interface FactRecord {
  readonly fieldKey: string;
  readonly state: FactState;
  readonly sourceClass: SourceClass;
  /** ISO 8601 instant of the recorded human review, if any. */
  readonly reviewedAt?: string | null;
}

/**
 * absent: nothing recorded for the key · undecided: publishing needs a value or a deliberate
 * withholding · unreviewed: an imported decided value no person has confirmed.
 */
export type ReadinessProblem = "absent" | "undecided" | "unreviewed";

export interface MissingFact {
  readonly key: string;
  readonly problem: ReadinessProblem;
  readonly state?: FactState;
}

/** States that record a decision about the value; only these can be confirmed. */
export const decidedFactStates: readonly FactState[] = ["known", "not_applicable", "withheld"];

const residential: readonly PropertyType[] = ["apartment", "house"];

/** The facts §18.1 requires a public listing to state (possibly as unknown). */
export function requiredFactKeys(propertyType: PropertyType): readonly string[] {
  return ["price", "location", "area", ...(residential.includes(propertyType) ? ["bedrooms"] : [])];
}

/** `area` stands for every basis: area.living, area.built, area.total, area.land. */
function factsForKey(key: string, facts: readonly FactRecord[]): FactRecord[] {
  return key === "area"
    ? facts.filter((f) => f.fieldKey === "area" || f.fieldKey.startsWith("area."))
    : facts.filter((f) => f.fieldKey === key);
}

export function needsHumanReview(fact: FactRecord): boolean {
  return (
    fact.sourceClass === "legacy_import" &&
    !fact.reviewedAt &&
    decidedFactStates.includes(fact.state)
  );
}

/** Keys where only a known value (or, for price, price on request) may be published. */
const mustBeDecided: Readonly<Record<string, readonly FactState[]>> = {
  price: ["known", "withheld"],
  location: ["known"],
};

export function missingRequiredFacts(
  propertyType: PropertyType,
  facts: readonly FactRecord[],
): MissingFact[] {
  const missing: MissingFact[] = [];
  for (const key of requiredFactKeys(propertyType)) {
    const recorded = factsForKey(key, facts);
    if (recorded.length === 0) {
      missing.push({ key, problem: "absent" });
      continue;
    }
    const accepted = mustBeDecided[key];
    for (const fact of recorded) {
      if (accepted && !accepted.includes(fact.state)) {
        missing.push({ key: fact.fieldKey, problem: "undecided", state: fact.state });
      } else if (needsHumanReview(fact)) {
        missing.push({ key: fact.fieldKey, problem: "unreviewed", state: fact.state });
      }
    }
  }
  return missing;
}

/** Facts that change a decision for this kind of property; their unknowns are worth asking about. */
const decisionFeatures: Readonly<Record<PropertyType, readonly string[]>> = {
  apartment: ["condition", "floor_number", "total_floors", "parking_kind", "construction_status"],
  house: ["condition", "storeys_count", "parking_kind", "utilities_status", "road_access_status"],
  plot: [
    "zoning_status",
    "permitted_use",
    "land_category",
    "utilities_status",
    "road_access_status",
  ],
  commercial: ["condition", "premises_count", "permitted_use", "parking_kind"],
  hotel: ["condition", "hotel_room_count", "permitted_use", "parking_kind"],
  development: ["construction_status", "permitted_use", "parking_kind"],
  other: ["condition"],
};

export function decisionFactKeys(propertyType: PropertyType): readonly string[] {
  return [
    "price",
    "area",
    ...(residential.includes(propertyType) ? ["bedrooms", "rooms"] : []),
    ...decisionFeatures[propertyType].map((f) => `feature.${f}`),
  ];
}
