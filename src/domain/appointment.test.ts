import { describe, expect, it } from "vitest";
import {
  appointmentMachine,
  appointmentTransitions,
  effectiveSlot,
  guardAppointmentTransition,
  type Slot,
} from "./appointment";
import { grantsForRoles } from "./capabilities";
import { applyTransition } from "./transition";

const coordinator = { kind: "staff", id: "coord-1" } as const;
const slot: Slot = {
  startsAt: "2026-10-02T08:00:00Z",
  endsAt: "2026-10-02T09:00:00Z",
  timezone: "Europe/Sofia",
};
const next: Slot = {
  startsAt: "2026-10-03T08:00:00Z",
  endsAt: "2026-10-03T09:00:00Z",
  timezone: "Europe/Sofia",
};

describe("appointments (§07.5, F07, F22)", () => {
  it("A20: a request is not a confirmation; confirming needs host, access and timezone", () => {
    expect(
      guardAppointmentTransition(
        "requested",
        "confirmed",
        { slot, hostAvailable: true },
        coordinator,
      ),
    ).toEqual({
      outcome: "denied",
      code: "property_access_unconfirmed",
    });
    expect(
      guardAppointmentTransition(
        "requested",
        "confirmed",
        { slot, hostAvailable: true, propertyAccess: "confirmed" },
        coordinator,
      ).outcome,
    ).toBe("allowed");
  });

  it("A51: a stale calendar sync prevents confirmation", () => {
    expect(
      guardAppointmentTransition(
        "proposed",
        "confirmed",
        { slot, hostAvailable: true, propertyAccess: "confirmed", calendarSyncCurrent: false },
        coordinator,
      ),
    ).toEqual({ outcome: "denied", code: "calendar_sync_stale" });
  });

  it("A21: a reschedule request keeps the confirmed arrangement until the replacement is agreed", () => {
    expect(
      effectiveSlot({ state: "reschedule_requested", confirmedSlot: slot, proposedSlot: next }),
    ).toEqual(slot);
    expect(effectiveSlot({ state: "proposed", proposedSlot: next })).toBeNull();
  });

  it("A22: no-show starts with a factual check and cancellation keeps a reason", () => {
    expect(guardAppointmentTransition("confirmed", "no_show", {}, coordinator)).toEqual({
      outcome: "denied",
      code: "factual_check_required",
    });
    expect(guardAppointmentTransition("confirmed", "cancelled", {}, coordinator)).toEqual({
      outcome: "denied",
      code: "reason_required",
    });
    expect(appointmentMachine.isTerminal("cancelled")).toBe(true);
  });

  it("A21: the confirmed viewing can still take place or be missed while a reschedule is pending", () => {
    expect(appointmentMachine.check("reschedule_requested", "completed").outcome).toBe("allowed");
    expect(appointmentMachine.check("reschedule_requested", "no_show").outcome).toBe("allowed");
    expect(
      guardAppointmentTransition(
        "reschedule_requested",
        "completed",
        { attendanceRecorded: true },
        coordinator,
      ).outcome,
    ).toBe("allowed");
    // Withdrawing the request keeps the confirmed slot without re-running slot checks.
    expect(
      guardAppointmentTransition(
        "reschedule_requested",
        "confirmed",
        { calendarSyncCurrent: false },
        coordinator,
      ).outcome,
    ).toBe("allowed");
  });

  it("F07 step 6: a client cancels or asks to reschedule through the same record, nothing more", () => {
    const client = { kind: "client", id: "client-1" } as const;
    const record = { id: "apt-1", state: "confirmed" as const, version: 1 };
    const request = (to: "cancelled" | "reschedule_requested" | "completed") =>
      applyTransition(appointmentTransitions, record, {
        actor: client,
        capabilities: grantsForRoles(["verified_client"]),
        expectedVersion: 1,
        to,
        evidence: { reason: "Flight moved", attendanceRecorded: true },
        operationId: "op-1",
        at: "2026-09-24T09:00:00Z",
      });
    expect(request("cancelled").outcome).toBe("applied");
    expect(request("reschedule_requested").outcome).toBe("applied");
    expect(request("completed")).toEqual({ outcome: "denied", code: "staff_required" });
    // A client without the portal capability on this record is refused.
    expect(
      applyTransition(appointmentTransitions, record, {
        actor: client,
        capabilities: [],
        expectedVersion: 1,
        to: "cancelled",
        evidence: { reason: "x" },
        operationId: "op-2",
        at: "2026-09-24T09:00:00Z",
      }),
    ).toEqual({ outcome: "denied", code: "missing_capability" });
  });
});
