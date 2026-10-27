import { expect, it } from "vitest";
import { rentalFact } from "@/domain/rental-facts";
import { emptyDraft } from "./contracts";
import { rentalTermsOf } from "./rental-terms";
import { workingDraftFrom } from "./working-draft";

it("F26 preserves explicit absence, zero and exact source money/date/restrictions across a revision", () => {
  const draft = {
    ...emptyDraft,
    sourceReference: "synthetic-rental-source",
    rentalDepositState: "known" as const,
    rentalDeposit: "1200.03",
    rentalChargesState: "known" as const,
    rentalCharges: "0",
    rentalChargesIncludes: "building maintenance",
    rentalAvailableFromState: "known" as const,
    rentalAvailableFrom: "2030-04-05",
    rentalRestrictionsState: "known" as const,
    rentalRestrictions: "Source wording stays exact.",
  };
  const terms = { purpose: "long_term_rent", facts: rentalTermsOf(draft) };
  expect(rentalFact(terms, "rental.deposit")).toMatchObject({
    state: "known",
    values: [{ amountMinor: 120003, currency: "EUR", period: "total" }],
    provenance: { sourceReference: draft.sourceReference },
  });
  expect(rentalFact(terms, "rental.recurring_charges").values[0]?.amountMinor).toBe(0);
  const restored = workingDraftFrom({ terms, sourceCopy: {} }, []);
  expect(restored).toMatchObject({
    rentalDeposit: "1200.03",
    rentalCharges: "0.00",
    rentalAvailableFrom: "2030-04-05",
    rentalRestrictions: draft.rentalRestrictions,
  });
  expect(rentalTermsOf(emptyDraft)["rental.recurring_charges"]).toMatchObject({
    state: "unknown",
    value: null,
  });
  expect(rentalFact({}, "rental.deposit")).toMatchObject({ state: "unknown", values: [] });
});

it("F26 retains conflicting candidates without selecting one and rejects unsupported dates/amounts", () => {
  const draft = {
    ...emptyDraft,
    rentalDepositState: "conflicting" as const,
    rentalDeposit: "100|200",
  };
  const terms = { purpose: "long_term_rent", facts: rentalTermsOf(draft) };
  expect(rentalFact(terms, "rental.deposit")).toMatchObject({
    state: "conflicting",
    values: [{ amountMinor: 10000 }, { amountMinor: 20000 }],
  });
  expect(() =>
    rentalTermsOf({
      ...emptyDraft,
      rentalAvailableFromState: "known",
      rentalAvailableFrom: "2030-02-30",
    }),
  ).toThrow();
  expect(() =>
    rentalTermsOf({ ...emptyDraft, rentalDepositState: "known", rentalDeposit: "-1" }),
  ).toThrow();
});
