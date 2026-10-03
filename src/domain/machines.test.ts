import { describe, expect, it } from "vitest";
import { appointmentMachine } from "./appointment";
import { approvalMachine } from "./approval";
import { demandMachine, dispositionMachine, serviceIntakeMachine, supplyMachine } from "./case";
import { documentMachine } from "./document";
import { externalActionMachine } from "./external-action";
import { inquiryMachine } from "./inquiry";
import { interestMachine } from "./interest";
import { commercialMachine, editorialMachine } from "./listing";
import { localeMachine } from "./localized-revision";
import { messageMachine } from "./message";
import { privacyRequestMachine } from "./privacy";
import { proposalMachine } from "./proposal";
import { deliveryMachine, publicationMachine } from "./publication";
import { sellerInstructionMachine } from "./seller-instruction";
import type { Machine } from "./state-machine";
import { subscriptionMachine } from "./subscription";
import { taskMachine } from "./task";

const machines: Record<string, Machine<string>> = {
  inquiry: inquiryMachine,
  demandCase: demandMachine,
  supplyCase: supplyMachine,
  serviceIntakeCase: serviceIntakeMachine,
  caseDisposition: dispositionMachine,
  interest: interestMachine,
  commercial: commercialMachine,
  editorial: editorialMachine,
  locale: localeMachine,
  publication: publicationMachine,
  delivery: deliveryMachine,
  appointment: appointmentMachine,
  message: messageMachine,
  document: documentMachine,
  proposal: proposalMachine,
  task: taskMachine,
  approval: approvalMachine,
  sellerInstruction: sellerInstructionMachine,
  subscription: subscriptionMachine,
  externalAction: externalActionMachine,
  privacyRequest: privacyRequestMachine,
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
