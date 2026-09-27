// PropertyFactRevision material-change classification (architecture §4.1, §7.4). A revision is
// an immutable set of typed facts; comparing it with its predecessor decides whether current
// public presentations built on the old facts may have become inaccurate.
import { canonicalJson } from "./approval";
import type { FactState } from "./facts";

export const materialChangeClasses = ["initial", "none", "non_material", "material"] as const;
export type MaterialChangeClass = (typeof materialChangeClasses)[number];

/** The comparable content of one fact: state, value, unit and basis (not its provenance). */
export interface FactSnapshot {
  readonly state: FactState;
  readonly value?: unknown;
  readonly unit?: string | null;
  readonly basis?: string | null;
}

export type FactSet = Readonly<Record<string, FactSnapshot>>;

export interface FactChangeClassification {
  readonly classification: MaterialChangeClass;
  readonly changedKeys: readonly string[];
  /** Keys whose change can make an existing public claim inaccurate. */
  readonly materialKeys: readonly string[];
}

const comparable = (fact: FactSnapshot | undefined) =>
  fact
    ? canonicalJson({
        state: fact.state,
        value: fact.value ?? null,
        unit: fact.unit ?? null,
        basis: fact.basis ?? null,
      })
    : null;

/**
 * A change is material when it alters or retracts a known value (a claim may already be
 * public) or records a conflict (a credible dispute). Filling in a value that was not known
 * adds information without falsifying anything, so it is not material.
 */
export function classifyFactChanges(
  previous: FactSet | null,
  next: FactSet,
): FactChangeClassification {
  if (!previous) {
    return { classification: "initial", changedKeys: Object.keys(next).sort(), materialKeys: [] };
  }
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  const changedKeys = keys.filter((key) => comparable(previous[key]) !== comparable(next[key]));
  const materialKeys = changedKeys.filter(
    (key) => previous[key]?.state === "known" || next[key]?.state === "conflicting",
  );
  const classification: MaterialChangeClass =
    changedKeys.length === 0 ? "none" : materialKeys.length > 0 ? "material" : "non_material";
  return { classification, changedKeys, materialKeys };
}
