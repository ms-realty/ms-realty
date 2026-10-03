// Appointments (architecture §6.4). A requested window or a tentative proposal is not a
// confirmation, and a reschedule keeps the confirmed arrangement until the replacement is
// accepted. Confirmation occupies exclusive resource intervals (broker, property access).
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

/** Resources a confirmed appointment occupies exclusively for its interval (AT30). */
export const appointmentResourceKinds = ["broker", "property_access"] as const;
export type AppointmentResourceKind = (typeof appointmentResourceKinds)[number];

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
  /** At least one client participant besides the host. */
  readonly participantCount?: number;
  /** The explicit manual step: external busy periods entered or the external calendar checked. */
  readonly externalBusyChecked?: boolean;
  /** No internal resource conflict for the interval, travel buffers included. */
  readonly resourcesFree?: boolean;
  /** The listing's availability is confirmed under policy (§7.1), not merely published. */
  readonly availabilityConfirmed?: boolean;
  readonly attendanceRecorded?: boolean;
  /** No-show handling starts with a factual check, not an automated penalty. */
  readonly factualCheckNote?: string;
  readonly reason?: string;
}

/** What a client may do through the same record; everything else is staff work. */
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
        need((evidence.participantCount ?? 0) > 0, "participants_required"),
        need(evidence.externalBusyChecked, "external_busy_check_required"),
        need(evidence.resourcesFree, "appointment_conflict"),
        need(evidence.availabilityConfirmed, "availability_reconfirmation_required"),
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
 * The arrangement participants should rely on now (AT32): while a reschedule is pending, the
 * previously confirmed slot stays in force; a proposal alone never replaces it.
 */
export function effectiveSlot(appointment: AppointmentArrangement): Slot | null {
  if (appointment.state === "confirmed" || appointment.state === "reschedule_requested") {
    return appointment.confirmedSlot ?? null;
  }
  return null;
}
