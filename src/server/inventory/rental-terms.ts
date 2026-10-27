import { z } from "zod";
import type { FactState } from "@/domain/facts";
import { type RentalFactKey, rentalValueSchemas } from "@/domain/rental-facts";
import { AppError } from "../errors";
import type { ListingDraft } from "./contracts";

function amount(value: string, field: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new AppError("validation_failed", { fieldErrors: { [field]: ["invalid"] } });
  const [whole = "0", fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AppError("validation_failed", { fieldErrors: { [field]: ["invalid"] } });
  return Number(minor);
}

/** Freeze only the exact supplied rental values; absent states keep null rather than zero. */
export function rentalTermsOf(draft: ListingDraft) {
  const fact = (
    key: RentalFactKey,
    state: FactState,
    raw: string,
    field: string,
    transform: (text: string) => unknown,
  ) => {
    const supplied = state === "conflicting" ? raw.split("|").map((value) => value.trim()) : [raw];
    const values = state === "known" || state === "conflicting" ? supplied.map(transform) : [];
    const valid = z
      .array(rentalValueSchemas[key])
      .min(state === "conflicting" ? 2 : 1)
      .safeParse(values);
    if (values.length && !valid.success)
      throw new AppError("validation_failed", { fieldErrors: { [field]: ["invalid"] } });
    return {
      state,
      value: values.length ? (state === "conflicting" ? values : values[0]) : null,
      sourceClass: draft.sourceClass,
      sourceReference: draft.sourceReference,
      sourceLanguage: draft.sourceLanguage,
    };
  };
  return {
    "rental.deposit": fact(
      "rental.deposit",
      draft.rentalDepositState,
      draft.rentalDeposit,
      "rentalDeposit",
      (value) => ({
        amountMinor: amount(value, "rentalDeposit"),
        currency: "EUR",
        period: "total",
      }),
    ),
    "rental.recurring_charges": fact(
      "rental.recurring_charges",
      draft.rentalChargesState,
      draft.rentalCharges,
      "rentalCharges",
      (value) => ({
        amountMinor: amount(value, "rentalCharges"),
        currency: "EUR",
        period: "month",
        inclusions: draft.rentalChargesIncludes
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    ),
    "rental.available_from": fact(
      "rental.available_from",
      draft.rentalAvailableFromState,
      draft.rentalAvailableFrom,
      "rentalAvailableFrom",
      (value) => value,
    ),
    "rental.restrictions": fact(
      "rental.restrictions",
      draft.rentalRestrictionsState,
      draft.rentalRestrictions,
      "rentalRestrictions",
      (value) => value,
    ),
  };
}
