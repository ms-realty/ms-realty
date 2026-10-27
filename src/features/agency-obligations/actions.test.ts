import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPathHeader } from "@/i18n/config";
import { AppError, toErrorBody } from "@/server/errors";
import type { HandlerContext } from "@/server/http/next";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { agencyAction } from "./actions";
import { agencyReceiptPath, agencyScope } from "./contract";
import { agencyCopy } from "./copy";

const id = "10000000-0000-4000-8000-000000000010";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), path: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ [requestPathHeader]: mocks.path }),
}));
vi.mock("@/server/agency-obligations/commands", () => ({ executeAgencyCommand: mocks.execute }));
vi.mock("@/server/auth/pages", async (original) => ({
  ...(await original<object>()),
  requireAuthHost: vi.fn(),
}));
vi.mock("@/server/http/next", () => ({
  action: async <T>(fn: (context: HandlerContext) => Promise<T>) => {
    try {
      return {
        ok: true,
        data: await fn({
          db: "unused",
          session: { account: { kind: "staff" }, actor: { kind: "staff" } },
        } as unknown as HandlerContext),
      };
    } catch (error) {
      return { ok: false, error: toErrorBody(error, "synthetic-agency-action") };
    }
  },
}));
function input() {
  const initial = initialFormState(agencyScope("partnerSave", id), {
    caseId: "",
    counterpartyPartyId: id,
    relationship: "referral",
    purpose: "Synthetic supplied scope",
    sourceReference: "Synthetic actual-input reference",
    sourceVersion: "fixture-1",
    termsText: "Synthetic exact supplied text",
    documentVersionId: "",
    acceptedReference: "",
    acceptedAt: "",
    validUntil: "",
    unknowns: "Actual acceptance remains unknown",
    reviewed: "true",
  });
  const data = new FormData();
  for (const [key, value] of Object.entries(initial.values)) data.set(key, value);
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, "");
  data.set(formFields.intent, "submit");
  return { initial, data };
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe.each(["bg", "en", "ru"])("B10 native action recovery in %s", (locale) => {
  it("keeps the same draft and operation for fresh-auth recovery at the exact current entry", async () => {
    const { initial, data } = input();
    mocks.path = `/${locale}/operations/agency/partners/new?draft=${id}`;
    mocks.execute.mockRejectedValueOnce(new AppError("step_up_required"));
    const result = await agencyAction(locale, "partnerSave", id, initial, data);
    expect(result.operationId).toBe(initial.operationId);
    expect(result.values.termsText).toBe(initial.values.termsText);
    expect(result.values.reviewed).toBe("");
    expect(result.outcome).toMatchObject({
      kind: "rejected",
      code: "STEP_UP_REQUIRED",
      message: agencyCopy(locale).stepUp,
      recovery: { href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(mocks.path)}` },
    });
  });
  it("reconciles an original unknown operation instead of offering a new-key retry", async () => {
    const { initial, data } = input(),
      original = input().initial.operationId;
    mocks.execute.mockRejectedValueOnce(
      new AppError("outcome_unknown", { current: { operationKey: original } }),
    );
    const result = await agencyAction(locale, "partnerSave", id, initial, data);
    expect(result.operationId).toBe(initial.operationId);
    expect(result.outcome).toMatchObject({
      kind: "unknown",
      status: { href: agencyReceiptPath(locale, "partnerSave", id, original) },
    });
  });
  it("retains exact source text after known validation failure and issues a distinct reconciliation identity", async () => {
    const { initial, data } = input();
    mocks.execute.mockRejectedValueOnce(
      new AppError("validation_failed", {
        fieldErrors: { termsText: ["synthetic_missing_source"] },
      }),
    );
    const result = await agencyAction(locale, "partnerSave", id, initial, data);
    expect(result.values.termsText).toBe(initial.values.termsText);
    expect(result.values.reviewed).toBe("");
    expect(result.operationId).not.toBe(initial.operationId);
    expect(result.reconciliation?.href).toBe(
      agencyReceiptPath(locale, "partnerSave", id, result.operationId),
    );
    expect(result.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { termsText: expect.any(Array) },
    });
  });
});
