// Short-stay quotes and reservations (spec F27, A61, A62). "Request to stay" creates a
// request, not a reservation; payment status comes only from the provider.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const reservationStates = [
  "requested",
  "awaiting_confirmation",
  "payment_pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;
export type ReservationState = (typeof reservationStates)[number];

export const paymentStates = [
  "not_required",
  "pending",
  "confirmed_by_provider",
  "failed",
  "refunded",
] as const;
export type PaymentState = (typeof paymentStates)[number];

export const reservationMachine = defineMachine<ReservationState>(reservationStates, {
  requested: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: ["payment_pending", "confirmed", "cancelled"],
  payment_pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
});

export interface StayDates {
  /** ISO dates (YYYY-MM-DD); checkOut is exclusive. */
  readonly checkIn: string;
  readonly checkOut: string;
}

export function staysOverlap(a: StayDates, b: StayDates): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export interface Quote {
  readonly version: number;
  readonly expiresAt: string;
}

export function isQuoteValid(quote: Quote, now: string): boolean {
  return Date.parse(now) < Date.parse(quote.expiresAt);
}

export interface ReservationEvidence {
  readonly dates?: StayDates;
  /** Dates of reservations already holding capacity for the same listing. */
  readonly holdingReservations?: readonly StayDates[];
  readonly quote?: Quote;
  readonly now?: string;
  readonly acceptedTermsVersion?: string;
  readonly payment?: PaymentState;
  /** Cancellation terms displayed to the guest before submission. */
  readonly cancellationTermsShown?: string;
  readonly reason?: string;
}

export function guardReservationTransition(
  _from: ReservationState,
  to: ReservationState,
  evidence: ReservationEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "payment_pending":
    case "confirmed": {
      const dates = evidence.dates;
      const conflict =
        dates && evidence.holdingReservations?.some((held) => staysOverlap(held, dates));
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(dates, "dates_required"),
        need(!conflict, "availability_conflict"),
        need(
          evidence.quote && evidence.now && isQuoteValid(evidence.quote, evidence.now),
          "quote_expired",
        ),
        need(evidence.acceptedTermsVersion, "terms_not_accepted"),
        to === "confirmed"
          ? need(
              evidence.payment === "not_required" || evidence.payment === "confirmed_by_provider",
              "payment_not_confirmed",
            )
          : undefined,
      );
    }
    case "cancelled":
      return firstDenial(
        need(evidence.reason, "reason_required"),
        need(evidence.cancellationTermsShown, "cancellation_terms_not_shown"),
      );
    default:
      return allowed;
  }
}

export const reservationTransitions: TransitionSpec<ReservationState, ReservationEvidence> = {
  recordType: "reservation",
  machine: reservationMachine,
  capabilityFor: () => "reservation.manage",
  guard: guardReservationTransition,
};
