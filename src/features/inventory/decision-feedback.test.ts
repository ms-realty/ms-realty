import { describe, expect, it } from "vitest";
import type { ErrorBody } from "@/server/errors";
import { inventoryCopy } from "./copy";
import type { InventoryDecisionContext, InventoryDecisionValues } from "./decision-contract";
import { inventoryDecisionFeedback } from "./decision-feedback";

const context: InventoryDecisionContext = {
  locale: "en",
  reference: "MS-00001",
  intent: "prepare",
  revisionId: "synthetic-source",
};
const values: InventoryDecisionValues = {
  scope: "Synthetic review",
  confirmed: "yes",
  publicationLocale: "en",
};
const status = { href: "/en/inventory/operations/exact-operation", label: "Operation receipt" };
const error = (extra: Partial<ErrorBody> = {}): ErrorBody => ({
  code: "PUBLICATION_INELIGIBLE",
  message: "Private database/provider detail must not be displayed",
  correlationId: "synthetic",
  retryable: false,
  outcome: "not_applied",
  ...extra,
});

describe("inventory decision recovery", () => {
  it("routes an exact missing seller prerequisite to evidence and never retries a recorded rejection", () => {
    expect(
      inventoryDecisionFeedback(
        error({ fieldErrors: { publication: ["seller_instruction_required"] } }),
        context,
        values,
        status,
      ),
    ).toEqual({
      kind: "rejected",
      code: "PUBLICATION_INELIGIBLE",
      retryable: false,
      message: "Current reviewed seller permission for these exact terms is required.",
      recovery: { href: "/en/inventory/MS-00001/evidence", label: "Review seller evidence" },
    });
  });
  it("retains exact reconciliation for unknown outcomes and never offers a replacement command", () => {
    expect(
      inventoryDecisionFeedback(
        error({ outcome: "unknown", retryable: true }),
        context,
        values,
        status,
      ),
    ).toEqual({
      kind: "unknown",
      code: "OUTCOME_UNKNOWN",
      message: inventoryCopy("en").form.unknown,
      status,
    });
  });
  it("requires a fresh reviewed decision after a conflict without automatic reapply", () => {
    const result = inventoryDecisionFeedback(
      error({ code: "REVISION_CONFLICT", current: { private: "not a safe projection" } }),
      context,
      values,
      status,
    );
    expect(result).toMatchObject({
      kind: "conflict",
      recovery: { href: "/en/inventory/MS-00001?review=synthetic#inventory-review" },
    });
    expect(result).not.toHaveProperty("reapply");
    expect(result).not.toHaveProperty("latest");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("only maps allowlisted blocker codes, including localized fallback and safe translation destinations", () => {
    const unsafe = error({ fieldErrors: { publication: ["<private-provider-payload>"] } });
    expect(
      inventoryDecisionFeedback(unsafe, { ...context, locale: "bg" }, values, status),
    ).toMatchObject({ message: inventoryCopy("bg").blocked, retryable: false });
    const translation = error({ fieldErrors: { publication: ["locale_not_approved_for_source"] } });
    expect(inventoryDecisionFeedback(translation, context, values, status)).toMatchObject({
      recovery: { href: "/en/inventory/MS-00001/translations/en" },
    });
    expect(
      inventoryDecisionFeedback(
        translation,
        context,
        { ...values, publicationLocale: "//outside.test" },
        status,
      ),
    ).toMatchObject({
      recovery: { href: "/en/inventory/MS-00001?review=synthetic#inventory-review" },
    });
  });
  it("returns field corrections without exposing raw validation detail", () => {
    expect(
      inventoryDecisionFeedback(
        error({
          code: "VALIDATION_FAILED",
          fieldErrors: { scope: ["private"], confirmed: ["private"] },
        }),
        context,
        values,
        status,
      ),
    ).toMatchObject({
      kind: "validation",
      fieldErrors: {
        scope: ["Enter a review note of 5–1000 characters."],
        confirmed: ["Confirm that you reviewed this exact revision and scope."],
      },
    });
  });
});
