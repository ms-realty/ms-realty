// O22 / F25: exact policy-bound observations; a bounded partial cohort is never a median.
import {
  type ApprovedOperatingPolicySnapshot,
  readOperatingPolicySnapshot,
  type StaffedDuration,
  staffedDuration,
} from "@/domain/operating-policy";

export const maxStaffedResponses = 1000;
const dayMs = 86400000;
type UnknownReason = Extract<StaffedDuration, { status: "unknown" }>["reason"];
type Duration = StaffedDuration | { status: "unknown"; reason: "calculation_limit" };
interface ReaderOptions {
  maxCalendarSlices?: number;
}

/** One reader per report. Full UTC days are reusable across observations, while partial
 * endpoints retain the canonical reader's exact clipping and Sofia DST behavior. Both
 * unique cached days and endpoint work share a finite report-wide calculation budget. */
export function createReportStaffedDurationReader({
  maxCalendarSlices = 4096,
}: ReaderOptions = {}) {
  const policies = new Map<
    string,
    { snapshot: ApprovedOperatingPolicySnapshot | null; days: Map<number, StaffedDuration> }
  >();
  let slices = 0;
  return (value: unknown, start: Date, end: Date): Duration => {
    const key = JSON.stringify(value) ?? "undefined";
    let policy = policies.get(key);
    if (!policy) {
      policy = { snapshot: readOperatingPolicySnapshot(value), days: new Map() };
      policies.set(key, policy);
    }
    const snapshot = policy.snapshot;
    if (!snapshot) return { status: "unknown", reason: "no_reviewed_policy" };
    const from = start.getTime(),
      until = end.getTime();
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(until) ||
      from >= until ||
      until - from > 366 * dayMs
    )
      return staffedDuration(snapshot, start, end);
    // Validate the entire interval's calendar bounds first, as the canonical reader does.
    for (const instant of [from, until - 1]) {
      const boundary = staffedDuration(snapshot, new Date(instant), new Date(instant));
      if (boundary.status === "unknown") return boundary;
    }
    let milliseconds = 0;
    for (let cursor = from; cursor < until; ) {
      const next = Math.min(until, (Math.floor(cursor / dayMs) + 1) * dayMs);
      const fullDay = cursor % dayMs === 0 && next - cursor === dayMs;
      let result = fullDay ? policy.days.get(cursor) : undefined;
      if (!result) {
        if (slices >= maxCalendarSlices) return { status: "unknown", reason: "calculation_limit" };
        slices++;
        result = staffedDuration(snapshot, new Date(cursor), new Date(next));
        if (fullDay) policy.days.set(cursor, result);
      }
      if (result.status === "unknown") return result;
      milliseconds += result.milliseconds;
      cursor = next;
    }
    return {
      status: "known",
      milliseconds,
      policyId: snapshot.policyId,
      policyVersion: snapshot.policyVersion,
    };
  };
}

export interface StaffedResponseObservation {
  operatingPolicySnapshot: unknown;
  /** Inquiry creation is its accepted receipt instant. Auto-acknowledgement is separate. */
  createdAt: Date;
  firstResponseAt: Date;
}
export interface StaffedResponseSummary {
  state: "observed" | "unknown" | "unobserved" | "denied" | "held";
  eligible: number | null;
  known: number | null;
  unknown: number | null;
  medianMinutes: number | null;
  smallSample: boolean;
  reason: "cohort_limit" | "calculation_limit" | null;
  unknownReasons: Partial<Record<UnknownReason, number>>;
}

export function summarizeStaffedResponses(
  observations: readonly StaffedResponseObservation[],
  eligible: number | null,
  options?: ReaderOptions,
): StaffedResponseSummary {
  const empty = {
    eligible,
    known: null,
    unknown: null,
    medianMinutes: null,
    smallSample: false,
    reason: null,
    unknownReasons: {},
  };
  if (eligible === null) return { ...empty, state: "denied" };
  if (eligible > maxStaffedResponses) return { ...empty, state: "held", reason: "cohort_limit" };
  if (observations.length !== eligible)
    return { ...empty, state: "held", reason: "calculation_limit" };
  const read = createReportStaffedDurationReader(options);
  const known: number[] = [],
    unknownReasons: StaffedResponseSummary["unknownReasons"] = {};
  for (const observation of observations) {
    const result = read(
      observation.operatingPolicySnapshot,
      observation.createdAt,
      observation.firstResponseAt,
    );
    if (result.status === "known") known.push(result.milliseconds / 60000);
    else {
      if (result.reason === "calculation_limit")
        return { ...empty, state: "held", reason: "calculation_limit" };
      unknownReasons[result.reason] = (unknownReasons[result.reason] ?? 0) + 1;
    }
  }
  known.sort((a, b) => a - b);
  const middle = Math.floor(known.length / 2);
  return {
    ...empty,
    state: known.length ? "observed" : eligible ? "unknown" : "unobserved",
    known: known.length,
    unknown: eligible - known.length,
    medianMinutes: known.length
      ? ((known[middle] ?? 0) + (known[Math.floor((known.length - 1) / 2)] ?? 0)) / 2
      : null,
    smallSample: known.length > 0 && known.length < 5,
    unknownReasons,
  };
}
