import { describe, expect, it } from "vitest";
import { appointmentMachine } from "./appointment";
import { approvalMachine } from "./approval";
import { buyerCaseMachine } from "./buyer-case";
import { documentMachine } from "./document";
import { inquiryMachine } from "./inquiry";
import { commercialMachine, editorialMachine, freshnessMachine } from "./listing";
import { messageMachine } from "./message";
import { proposalMachine } from "./proposal";
import { destinationOutcomeMachine, distributionMachine } from "./publication";
import { rentalCaseMachine } from "./rental-case";
import { reservationMachine } from "./reservation";
import { sellerCaseMachine } from "./seller-case";
import { serviceRequestMachine } from "./service-request";
import type { Machine } from "./state-machine";
import { taskMachine } from "./task";
import { translationMachine } from "./translation";

const machines: Record<string, Machine<string>> = {
  inquiry: inquiryMachine,
  buyerCase: buyerCaseMachine,
  sellerCase: sellerCaseMachine,
  rentalCase: rentalCaseMachine,
  commercial: commercialMachine,
  editorial: editorialMachine,
  distribution: distributionMachine,
  freshness: freshnessMachine,
  translation: translationMachine,
  appointment: appointmentMachine,
  message: messageMachine,
  document: documentMachine,
  proposal: proposalMachine,
  task: taskMachine,
  approval: approvalMachine,
  destinationOutcome: destinationOutcomeMachine,
  serviceRequest: serviceRequestMachine,
  reservation: reservationMachine,
};

describe("every transition table", () => {
  it.each(Object.entries(machines))(
    "%s lists exactly its states and only known targets",
    (_name, machine) => {
      expect(Object.keys(machine.transitions).sort()).toEqual([...machine.states].sort());
      for (const targets of Object.values(machine.transitions)) {
        for (const target of targets) expect(machine.states).toContain(target);
      }
    },
  );

  it.each(Object.entries(machines))(
    "%s has every state reachable from its first state",
    (_name, machine) => {
      const seen = new Set<string>([machine.states[0] as string]);
      const queue = [machine.states[0] as string];
      while (queue.length > 0) {
        const state = queue.shift() as string;
        for (const next of machine.transitions[state] ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect([...seen].sort()).toEqual([...machine.states].sort());
    },
  );

  it("rejects a no-op transition", () => {
    expect(taskMachine.check("open", "open")).toEqual({ outcome: "denied", code: "no_change" });
  });
});
