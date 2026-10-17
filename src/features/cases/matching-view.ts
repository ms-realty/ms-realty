// O07 state mapping (design/contracts/o07.md §2–4): which frame a server read or a form outcome
// is, and the workbench URLs. Pure, so the frame choice is unit-tested apart from the markup.
import type { FormOutcome, FormValues } from "@/ui/form/contract";

/** Matches per page; «Покажете още» appends the next cursor page (O07READYMORE). */
export const matchPageSize = 24;
/** Appended pages kept in one URL; beyond this the broker narrows what the client wants. */
export const maxExtraPages = 9;

export type MatchingQuery = {
  /** A listing reference opens the single-property check (section 3). */
  readonly property?: string;
  /** The requirements revision the broker last saw (passed to every read, first page too). */
  readonly revision?: number;
  /** When that list was read (ISO instant), for the stale warning. */
  readonly at?: string;
  /** Cursors of the pages appended after the first one, in order. */
  readonly more: readonly string[];
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export function parseMatchingQuery(
  query: Record<string, string | string[] | undefined>,
): MatchingQuery {
  const property = one(query.property)?.trim().toUpperCase();
  const revision = one(query.revision);
  const at = one(query.at);
  const more =
    query.more === undefined ? [] : typeof query.more === "string" ? [query.more] : query.more;
  return {
    ...(property ? { property } : {}),
    ...(revision && /^[1-9]\d{0,8}$/.test(revision) ? { revision: Number(revision) } : {}),
    ...(at && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at) && !Number.isNaN(Date.parse(at))
      ? { at }
      : {}),
    more: more.filter((cursor) => /^[A-Za-z0-9_-]{1,512}$/.test(cursor)).slice(0, maxExtraPages),
  };
}

export function isListingReference(value: string | undefined): value is string {
  return Boolean(value && /^MS-\d{5,}$/.test(value));
}

export function matchingHref(locale: string, caseId: string, query: Partial<MatchingQuery> = {}) {
  const params = new URLSearchParams();
  if (query.property) params.set("property", query.property);
  if (query.revision) params.set("revision", String(query.revision));
  if (query.at) params.set("at", query.at);
  for (const cursor of query.more ?? []) params.append("more", cursor);
  const search = params.toString();
  return `/${locale}/cases/${caseId}/matching${search ? `?${search}` : ""}`;
}

/** Saved properties open on the deal page at their own row (O05 `#interest-{id}`). */
export const interestHref = (locale: string, caseId: string, interestId: string) =>
  `/${locale}/cases/${caseId}#interest-${interestId}`;

export type MatchItem = {
  readonly reference: string;
  readonly existingInterestId: string | null;
  readonly unconfirmed: readonly string[];
};

export type ListRead =
  | {
      readonly status: "criteria_required";
      readonly reason: "missing_or_invalid" | "kind_mismatch";
    }
  | {
      readonly status: "ready";
      readonly confirmed: readonly MatchItem[];
      readonly needsConfirmation: readonly MatchItem[];
      readonly stale: boolean;
    };

/** CRITMISSING · CRITKIND · STALE · EMPTY · READY (and READYMORE) · NEEDSCONF. */
export type ListState =
  | "criteriaMissing"
  | "criteriaKind"
  | "stale"
  | "empty"
  | "ready"
  | "needsConfirmation";

/** `revision_conflict`: the page named an older requirements revision than the current one. */
export function listState(read: ListRead | "revision_conflict"): ListState {
  if (read === "revision_conflict") return "stale";
  if (read.status === "criteria_required")
    return read.reason === "kind_mismatch" ? "criteriaKind" : "criteriaMissing";
  if (read.stale) return "stale";
  if (read.confirmed.length) return "ready";
  return read.needsConfirmation.length ? "needsConfirmation" : "empty";
}

/** The next property to work on: first one to add, else first one to confirm (not yet saved). */
export function nextProperty<T extends MatchItem>(
  read: { readonly confirmed: readonly T[]; readonly needsConfirmation: readonly T[] },
  except?: string,
): T | null {
  const open = (item: T) => item.reference !== except && !item.existingInterestId;
  return read.confirmed.find(open) ?? read.needsConfirmation.find(open) ?? null;
}

export type CheckRead =
  | {
      readonly kind: "candidate";
      readonly match: "match" | "needs_confirmation" | "no_match";
      readonly existingInterestId: string | null;
      readonly availability: string;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "not_found" }
  | { readonly kind: "stale" };

/** CHECKMATCH (and its NEGOTIATING/RESERVED variants) · ONLIST · CHECKNEEDS · CHECKNOMATCH. */
export type CheckState =
  | "checkMatch"
  | "checkNegotiating"
  | "checkReserved"
  | "onList"
  | "checkNeeds"
  | "checkNoMatch"
  | "unavailable"
  | "notFound"
  | "stale";

export function checkState(read: CheckRead): CheckState {
  if (read.kind === "unavailable") return "unavailable";
  if (read.kind === "not_found") return "notFound";
  if (read.kind === "stale") return "stale";
  // A saved property never offers an add, whatever its verdict (row rule, section 2).
  if (read.existingInterestId) return "onList";
  if (read.match === "no_match") return "checkNoMatch";
  if (read.match === "needs_confirmation") return "checkNeeds";
  if (read.availability === "negotiating") return "checkNegotiating";
  if (read.availability === "reserved_with_recorded_basis") return "checkReserved";
  return "checkMatch";
}

/** Adding is offered only for a fully confirmed property that is not saved yet. */
export function canOfferAdd(state: CheckState, permitted: boolean) {
  return (
    permitted &&
    (state === "checkMatch" || state === "checkNegotiating" || state === "checkReserved")
  );
}

/** The server's current truth for the same property, as the page last read it. */
export type MatchCurrent = {
  readonly briefRevision: number | null;
  readonly manifestId?: string;
  readonly availability?: string;
  readonly violated?: readonly string[];
  readonly unconfirmed?: readonly string[];
};

export type MatchChange = "brief" | "listing" | "availability" | "assessment" | "deal";

function sameKeys(a: unknown, b: readonly string[]) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const left = a.map(String).sort(),
    right = [...b].sort();
  return left.every((key, index) => key === right[index]);
}

/**
 * ADDCONFLICT names only the category that changed between the submitted review (the hidden
 * `matchReview` JSON) and the current read, in the order the command checks them; never a
 * person or a time (contract §1 rules). `deal`: none of the reviewed facts moved, the deal itself
 * was updated meanwhile.
 */
export function changedCategory(
  submitted: string | undefined,
  current: MatchCurrent | null,
): MatchChange {
  let review: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(submitted ?? "");
    if (parsed && typeof parsed === "object") review = parsed as Record<string, unknown>;
  } catch {
    review = null;
  }
  if (!review || !current) return "deal";
  if (current.briefRevision !== review.briefRevision) return "brief";
  if (current.manifestId !== undefined && current.manifestId !== review.manifestId)
    return "listing";
  if (current.availability !== undefined && current.availability !== review.availability)
    return "availability";
  if (
    (current.violated && !sameKeys(review.violated, current.violated)) ||
    (current.unconfirmed && !sameKeys(review.unconfirmed, current.unconfirmed))
  )
    return "assessment";
  return "deal";
}

/** ADDSEND · ADDED · ADDCONFLICT · ADDOFFLINE · ADDUNKNOWN · UNAVAILABLE · DENIED · NOTFOUND. */
export type AddState =
  | "form"
  | "sending"
  | "added"
  | "conflict"
  | "offline"
  | "unknown"
  | "unavailable"
  | "dealInactive"
  | "notFound"
  | "reviewRejected"
  | "failed";

/** Only a `confirmed` outcome (the command's readback) is ever shown as added. */
export function addState(
  outcome: FormOutcome<FormValues>,
  flags: { readonly pending: boolean; readonly offline: boolean },
): AddState {
  if (flags.pending) return "sending";
  if (flags.offline) return "offline";
  switch (outcome.kind) {
    case "confirmed":
      return "added";
    case "conflict":
      return "conflict";
    // Still running or not acknowledged: check the same request, never send a new one.
    case "unknown":
    case "accepted":
      return "unknown";
    case "validation":
      // Only the explanation is the broker's to correct here; any other refusal is the check.
      return outcome.fieldErrors.explanation?.length ? "form" : "reviewRejected";
    case "rejected":
      if (outcome.code === "LISTING_UNAVAILABLE") return "unavailable";
      if (outcome.code === "TRANSITION_DENIED") return "dealInactive";
      if (["NOT_FOUND", "NOT_AUTHORIZED", "UNAUTHENTICATED"].includes(outcome.code))
        return "notFound";
      return "failed";
    default:
      return "form";
  }
}
