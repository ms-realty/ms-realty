// Appointments (spec §07.5, F07, F22). A time suggestion is not a confirmation, and a new
// proposal keeps the confirmed arrangement until the replacement is agreed.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const appointmentStates = [
  "requested",
  "proposed",
  "confirmed",
  "reschedule_requested",
  "completed",
  "declined",
  "cancelled",
  "no_show",
] as const;
export type AppointmentState = (typeof appointmentStates)[number];

export const appointmentFormats = ["in_person", "remote"] as const;
export type AppointmentFormat = (typeof appointmentFormats)[number];

export const propertyAccessStates = ["unknown", "requested", "confirmed", "unavailable"] as const;
export type PropertyAccessState = (typeof propertyAccessStates)[number];

export const appointmentMachine = defineMachine<AppointmentState>(appointmentStates, {
  requested: ["proposed", "confirmed", "declined", "cancelled"],
  proposed: ["confirmed", "declined", "cancelled", "requested"],
  confirmed: ["reschedule_requested", "completed", "cancelled", "no_show"],
  // The confirmed arrangement stays in force, so it can still take place or be missed.
  reschedule_requested: ["confirmed", "cancelled", "completed", "no_show"],
  completed: [],
  declined: [],
  cancelled: [],
  no_show: [],
});

export interface Slot {
  /** ISO 8601 instants. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** IANA timezone of the property; never inferred from the traveller's device. */
  readonly timezone: string;
}

export interface AppointmentEvidence {
  readonly slot?: Slot;
  readonly hostAvailable?: boolean;
  readonly propertyAccess?: PropertyAccessState;
  /** False when the external calendar sync is stale: no instant confirmation claims (A51). */
  readonly calendarSyncCurrent?: boolean;
  readonly attendanceRecorded?: boolean;
  /** No-show handling starts with a factual check, not an automated penalty. */
  readonly factualCheckNote?: string;
  readonly reason?: string;
}

/** What a client may do through the same record (F07 step 6); everything else is staff work. */
const clientAppointmentTargets: readonly AppointmentState[] = ["cancelled", "reschedule_requested"];

export function guardAppointmentTransition(
  from: AppointmentState,
  to: AppointmentState,
  evidence: AppointmentEvidence,
  actor: Actor,
): Decision {
  if (actor.kind === "client" && !clientAppointmentTargets.includes(to)) {
    return denied("staff_required");
  }
  switch (to) {
    case "proposed":
      return firstDenial(
        need(evidence.slot, "slot_required"),
        need(evidence.slot?.timezone, "timezone_required"),
      );
    case "confirmed":
      // Withdrawing a reschedule request keeps the arrangement that was already confirmed.
      if (from === "reschedule_requested" && !evidence.slot) {
        return need(actor.kind === "staff", "human_required");
      }
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.slot?.timezone, "timezone_required"),
        need(evidence.hostAvailable, "host_unavailable"),
        need(evidence.propertyAccess === "confirmed", "property_access_unconfirmed"),
        need(evidence.calendarSyncCurrent !== false, "calendar_sync_stale"),
      );
    case "completed":
      return need(evidence.attendanceRecorded, "attendance_required");
    case "no_show":
      return need(evidence.factualCheckNote, "factual_check_required");
    case "declined":
    case "cancelled":
    case "reschedule_requested":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const appointmentTransitions: TransitionSpec<AppointmentState, AppointmentEvidence> = {
  recordType: "appointment",
  machine: appointmentMachine,
  capabilityFor: (_from, _to, actor) =>
    actor.kind === "client" ? "portal.appointment.request" : "appointment.manage",
  guard: guardAppointmentTransition,
};

export interface AppointmentArrangement {
  readonly state: AppointmentState;
  readonly confirmedSlot?: Slot;
  readonly proposedSlot?: Slot;
}

/**
 * The arrangement participants should rely on now (A21): while a reschedule is pending, the
 * previously confirmed slot stays in force; a proposal alone never replaces it.
 */
export function effectiveSlot(appointment: AppointmentArrangement): Slot | null {
  if (appointment.state === "confirmed" || appointment.state === "reschedule_requested") {
    return appointment.confirmedSlot ?? null;
  }
  return null;
}
