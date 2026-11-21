import { describe, expect, it } from "vitest";
import bg from "../../messages/bg/dealPath.json";
import { dealPathTemplates, genericDealPath } from "../config/tenant";
import {
  calendarDate,
  completionReadiness,
  composePath,
  type DerivedFacts,
  dealTransaction,
  derivedStepKeys,
  derivedSteps,
  dutyInScope,
  isCalendarDate,
  nextRecordedState,
  previewSteps,
  recordedSteps,
  resolveTemplate,
  stepDutyBlock,
  templateSteps,
  withdrawalEndsOn,
} from "./deal-path";

const at = (iso: string) => new Date(iso);
const none: DerivedFacts = {
  requestReceivedAt: at("2026-01-05T09:00:00Z"),
  briefAgreedAt: null,
  shortlisted: false,
  viewingDoneAt: null,
  viewingExpectedAt: null,
  termsAgreedAt: null,
};

describe("Deal path templates", () => {
  it("resolves the jurisdiction and transaction template, else the generic one", () => {
    expect(resolveTemplate("BG", "sale").key).toBe("BG.sale");
    expect(resolveTemplate("BG", "long_term_rent").key).toBe("BG.long_term_rent");
    expect(resolveTemplate("GR", "sale").key).toBe("GR.sale");
    expect(resolveTemplate("GR", "long_term_rent")).toEqual({
      key: "generic.long_term_rent",
      steps: genericDealPath.long_term_rent,
    });
    expect(resolveTemplate("DE", "sale").key).toBe("generic.sale");
    expect(resolveTemplate(null, "sale").key).toBe("generic.sale");
    expect(templateSteps("generic.sale")).toBe(genericDealPath.sale);
    expect(templateSteps("BG.sale")).toBe(dealPathTemplates["BG.sale"]);
    expect(templateSteps("XX.sale")).toBeNull();
  });

  it("maps Case kinds to a transaction; service intake has no path", () => {
    expect(dealTransaction("buyer")).toBe("sale");
    expect(dealTransaction("seller")).toBe("sale");
    expect(dealTransaction("tenant")).toBe("long_term_rent");
    expect(dealTransaction("landlord")).toBe("long_term_rent");
    expect(dealTransaction("service_intake")).toBeNull();
  });

  it("has a label and a one-sentence explanation for every step key", () => {
    const keys = new Set<string>(derivedStepKeys);
    for (const steps of [...Object.values(dealPathTemplates), ...Object.values(genericDealPath)])
      for (const step of steps ?? []) keys.add(step.key);
    for (const key of keys) {
      const copy = (bg.steps as Record<string, { label: string; about: string }>)[key];
      expect(copy?.label, key).toBeTruthy();
      expect(copy?.about.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, key).toBe(1);
    }
    expect(Object.keys(bg.steps).sort()).toEqual([...keys].sort());
    // Client-perspective sentences only exist for real steps.
    for (const [side, sentences] of Object.entries(bg.you))
      for (const key of Object.keys(sentences)) expect(keys.has(key), `${side}.${key}`).toBe(true);
  });
});

describe("Deal path derivation", () => {
  it("derives the demand early steps from existing records only", () => {
    const steps = derivedSteps("buyer", {
      ...none,
      briefAgreedAt: at("2026-01-06T10:00:00Z"),
      shortlisted: true,
    });
    expect(steps.map((s) => [s.key, s.settled])).toEqual([
      ["request_received", "done"],
      ["needs_agreed", "done"],
      ["homes_shortlisted", "done"],
      ["viewings", null],
      ["terms_agreed", null],
    ]);
    expect(steps.every((s) => s.source === "derived" && s.clientVisible)).toBe(true);
  });

  it("gives an owner-side Deal only the steps its records can show", () => {
    expect(derivedSteps("landlord", none).map((s) => [s.key, s.actor])).toEqual([
      ["request_received", "agency"],
      ["terms_agreed", "client"],
    ]);
  });

  it("marks done, where the Deal stands, what is next and what was passed without a record", () => {
    const template = dealPathTemplates["BG.sale"] ?? [];
    const rows = previewSteps(template).map((row, index) =>
      index <= 1 ? { ...row, state: "done" as const, doneOn: "2026-02-01" } : row,
    );
    const steps = [
      ...derivedSteps("buyer", { ...none, termsAgreedAt: at("2026-01-20T10:00:00Z") }),
      ...recordedSteps(rows),
    ];
    const path = composePath(steps, "staff");
    const status = Object.fromEntries(path.steps.map((s) => [s.key, s.status]));
    expect(status).toMatchObject({
      request_received: "done",
      needs_agreed: "not_recorded",
      homes_shortlisted: "not_recorded",
      viewings: "not_recorded",
      terms_agreed: "done",
      identity_checks: "done",
      deposit_preliminary_contract: "current",
      property_checks: "next",
      keys_handed_over: "upcoming",
    });
    expect(path.current).toBe("deposit_preliminary_contract");
    expect(path.next).toBe("property_checks");
    expect(path.steps.find((s) => s.key === "identity_checks")?.doneAt).toBe("2026-02-01");
    // A client never reads "no record": passed early steps are left out of their path.
    const client = composePath(steps, "client");
    expect(client.steps.map((s) => s.key)).toEqual([
      "request_received",
      "terms_agreed",
      ...template.map((s) => s.key),
    ]);
    expect(client.steps.some((s) => s.status === "not_recorded")).toBe(false);
    expect(client.current).toBe("deposit_preliminary_contract");
  });

  it("drops hidden steps before choosing where a client is", () => {
    const rows = previewSteps([
      { key: "identity_checks", actor: "agency", evidence: true, clientVisible: false },
      { key: "keys_handed_over", actor: "owner", evidence: false, clientVisible: true },
    ]);
    const terms = { ...none, termsAgreedAt: at("2026-01-20T10:00:00Z") };
    const client = composePath(
      [...derivedSteps("seller", terms), ...recordedSteps(rows)],
      "client",
    );
    expect(client.steps.map((s) => s.key)).not.toContain("identity_checks");
    expect(client.current).toBe("keys_handed_over");
    const staff = composePath([...derivedSteps("seller", terms), ...recordedSteps(rows)], "staff");
    expect(staff.current).toBe("identity_checks");
  });
});

describe("Deal path recording and completion", () => {
  it("allows only the one-step actions a step's state can take", () => {
    expect(nextRecordedState("pending", "done")).toBe("done");
    expect(nextRecordedState("pending", "skip")).toBe("skipped");
    expect(nextRecordedState("pending", "expect")).toBe("pending");
    expect(nextRecordedState("pending", "reopen")).toBeNull();
    expect(nextRecordedState("done", "done")).toBeNull();
    expect(nextRecordedState("done", "reopen")).toBe("pending");
    expect(nextRecordedState("skipped", "reopen")).toBe("pending");
    expect(nextRecordedState("skipped", "expect")).toBeNull();
  });

  it("completes only after agreed terms, settled steps and a done final step", () => {
    const agreed = { termsAgreedAt: at("2026-01-20T10:00:00Z") };
    const done = { state: "done" as const },
      skipped = { state: "skipped" as const },
      pending = { state: "pending" as const };
    expect(completionReadiness({ termsAgreedAt: null }, [done]).reason).toBe("terms_not_agreed");
    expect(completionReadiness(agreed, []).reason).toBe("steps_open");
    expect(completionReadiness(agreed, [done, pending, done]).reason).toBe("steps_open");
    expect(completionReadiness(agreed, [done, skipped]).reason).toBe("final_step_open");
    expect(completionReadiness(agreed, [skipped, done])).toEqual({ ready: true, reason: null });
  });

  it("ADR 0015: an open in-scope duty keeps a Deal from completing", () => {
    const agreed = { termsAgreedAt: at("2026-01-20T10:00:00Z") };
    const done = { state: "done" as const };
    expect(completionReadiness(agreed, [done, done], true).reason).toBe("duty_open");
    expect(completionReadiness(agreed, [done, done], false).ready).toBe(true);
  });

  it("ADR 0015: identity checks are in scope for every sale and for lettings from the threshold", () => {
    const rent = (amountMinor: number, currency = "EUR") => ({
      amountMinor,
      currency,
      period: "month",
    });
    expect(dutyInScope("brokerage_contract", "long_term_rent", rent(50_000))).toBe(true);
    expect(dutyInScope("customer_due_diligence", "sale", null)).toBe(true);
    expect(dutyInScope("customer_due_diligence", "long_term_rent", rent(50_000))).toBe(false);
    expect(dutyInScope("customer_due_diligence", "long_term_rent", rent(1_000_000))).toBe(true);
    // An unknown rent or another currency is treated as in scope: no rate is assumed.
    expect(dutyInScope("customer_due_diligence", "long_term_rent", null)).toBe(true);
    expect(dutyInScope("customer_due_diligence", "long_term_rent", rent(50_000, "GBP"))).toBe(true);
  });

  it("ADR 0015: refuses skipping a duty in scope and handing over before identity checks", () => {
    const sale = dealPathTemplates["BG.sale"] ?? [];
    const step = (key: string) => sale.find((s) => s.key === key);
    const base = { transaction: "sale" as const, terms: null, identityChecks: "pending" as const };
    expect(stepDutyBlock({ ...base, step: step("identity_checks"), action: "skip" })).toBe(
      "duty_in_scope",
    );
    expect(stepDutyBlock({ ...base, step: step("brokerage_agreement"), action: "skip" })).toBe(
      "duty_in_scope",
    );
    expect(stepDutyBlock({ ...base, step: step("notary_deed"), action: "done" })).toBe(
      "identity_checks_first",
    );
    expect(stepDutyBlock({ ...base, step: step("property_checks"), action: "done" })).toBeNull();
    expect(stepDutyBlock({ ...base, step: step("notary_deed"), action: "skip" })).toBeNull();
    expect(
      stepDutyBlock({ ...base, identityChecks: "done", step: step("notary_deed"), action: "done" }),
    ).toBeNull();
    // A small letting may record identity checks as not needed, and then nothing waits.
    const letting = {
      transaction: "long_term_rent" as const,
      terms: { amountMinor: 80_000, currency: "EUR", period: "month" },
      identityChecks: "skipped" as const,
    };
    expect(stepDutyBlock({ ...letting, step: step("identity_checks"), action: "skip" })).toBeNull();
    expect(
      stepDutyBlock({ ...letting, step: step("keys_handed_over"), action: "done" }),
    ).toBeNull();
  });

  it("counts the withdrawal period in calendar days from signing", () => {
    expect(withdrawalEndsOn("2026-01-20")).toBe("2026-02-03");
    expect(withdrawalEndsOn("2026-12-25")).toBe("2027-01-08");
  });

  it("reads calendar dates in the agency's zone and rejects impossible ones", () => {
    expect(calendarDate(at("2026-03-28T22:30:00Z"), "Europe/Sofia")).toBe("2026-03-29");
    expect(calendarDate(at("2026-03-28T21:30:00Z"), "Europe/Sofia")).toBe("2026-03-28");
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("26-02-28")).toBe(false);
  });
});
