// O24/F30: read-only directory POSTs share the real save form's native recovery identity.
import { beforeEach, expect, it, vi } from "vitest";
import { emptyOperatingPolicy } from "@/domain/operating-policy";
import { policyToValues } from "@/domain/operating-policy-form";
import { AppError, toErrorBody } from "@/server/errors";
import type { HandlerContext } from "@/server/http/next";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { submitPolicyDraft } from "../../../app/staff/[locale]/(workspace)/settings/operating-policy/actions";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  choices: vi.fn(),
  operation: vi.fn(),
  save: vi.fn(),
  approve: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/pages", () => ({ currentStaffAccess: mocks.access }));
vi.mock("@/server/operating-policy/service", () => ({
  listOperatingPolicyOwners: mocks.list,
  readOperatingPolicyOwnerChoices: mocks.choices,
  readOperatingPolicyOperation: mocks.operation,
  saveOperatingPolicy: mocks.save,
  approveOperatingPolicy: mocks.approve,
}));
vi.mock("@/server/http/next", () => ({
  action: async <T>(fn: (context: HandlerContext) => Promise<T>) => {
    try {
      return { ok: true, data: await fn({ db: "synthetic-db" } as unknown as HandlerContext) };
    } catch (error) {
      return { ok: false, error: toErrorBody(error, "synthetic-owner-search") };
    }
  },
}));
const owner = { id: "10000000-0000-4000-8000-000000000001", displayName: "Synthetic late owner" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ state: "ready", session: { id: "synthetic-session" } });
  mocks.list.mockResolvedValue({ rows: [owner], page: 2, search: "Synthetic", hasMore: true });
  mocks.choices.mockResolvedValue([owner]);
  mocks.operation.mockResolvedValue(null);
});
function input(browse = true) {
  const initial = initialFormState(
    "operating_policy.save",
    {
      ...policyToValues(emptyOperatingPolicy),
      ownerSearch: "Synthetic",
      ownerService: owner.id,
      coverage: "Synthetic unsaved coverage and source",
      calendarSource: "Synthetic exact source",
    },
    9,
  );
  const data = new FormData();
  for (const [key, value] of Object.entries(initial.values)) data.set(key, value);
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, "9");
  data.set(browse ? "_ownerPage" : formFields.intent, browse ? "2" : "submit");
  return { initial, data };
}
it("browses through a native POST without saving, retaining all fields, current revision and original issued key", async () => {
  const { initial, data } = input();
  // A directory read remains usable while the policy draft itself is incomplete/invalid.
  data.set("calendarState", "reviewed");
  data.set("validFrom", "");
  const result = await submitPolicyDraft("en", initial, data);
  expect(result).toMatchObject({
    operationId: initial.operationId,
    expectedRevision: 9,
    values: { ...initial.values, calendarState: "reviewed" },
    outcome: { kind: "idle" },
    ownerChoices: [owner],
    ownerDirectory: { page: 2, rows: [owner] },
  });
  expect(mocks.list).toHaveBeenCalledWith(
    "synthetic-db",
    { id: "synthetic-session" },
    { page: 2, search: "Synthetic" },
  );
  expect(mocks.choices).toHaveBeenCalledWith("synthetic-db", { id: "synthetic-session" }, [
    owner.id,
    "",
    "",
  ]);
  expect(result.reconciliation?.href).not.toContain("Synthetic");
  expect(result.reconciliation?.href).toContain(initial.operationId);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.approve).not.toHaveBeenCalled();
});
it.each(["duplicate key", "wrong command", "ambiguous submitter", "duplicate page"])(
  "rejects %s before directory reads",
  async (variant) => {
    const { initial, data } = input();
    if (variant === "duplicate key") data.append(formFields.operationId, initial.operationId);
    if (variant === "wrong command")
      data.set(
        formFields.operationId,
        initialFormState("operating_policy.approve", {}).operationId,
      );
    if (variant === "ambiguous submitter") data.set(formFields.intent, "submit");
    if (variant === "duplicate page") data.append("_ownerPage", "3");
    const result = await submitPolicyDraft("en", initial, data);
    expect(result.outcome.kind).toBe("validation");
    expect(result.values.coverage).toBe(initial.values.coverage);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);
it("reauthorizes browsing and clears candidate identities after permission loss", async () => {
  const { initial, data } = input();
  mocks.operation.mockRejectedValueOnce(new AppError("forbidden"));
  const result = await submitPolicyDraft("en", initial, data);
  expect(result).toMatchObject({
    operationId: initial.operationId,
    values: initial.values,
    outcome: { kind: "rejected", code: "NOT_AUTHORIZED" },
    ownerDirectory: { rows: [] },
    ownerChoices: [],
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("does not clear a recorded operation fence when browsing is requested after a lost response", async () => {
  const { initial, data } = input();
  mocks.operation.mockResolvedValueOnce({ status: "succeeded" });
  const result = await submitPolicyDraft("en", initial, data);
  expect(result).toMatchObject({
    operationId: initial.operationId,
    values: initial.values,
    outcome: { kind: "unknown", status: { href: expect.stringContaining(initial.operationId) } },
    ownerChoices: [],
  });
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps the exact late owner and key when an unrelated policy field fails native validation", async () => {
  const { initial, data } = input(false);
  data.set("daysSales", "0");
  const result = await submitPolicyDraft("en", initial, data);
  expect(result).toMatchObject({
    operationId: initial.operationId,
    expectedRevision: 9,
    values: { ownerService: owner.id, coverage: initial.values.coverage, daysSales: "0" },
    ownerChoices: [owner],
    outcome: { kind: "validation", fieldErrors: { daysSales: expect.any(Array) } },
  });
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["outcome_unknown", "version_conflict"] as const)(
  "preserves the command's %s through directory projection",
  async (code) => {
    const { initial, data } = input(false);
    mocks.save.mockRejectedValueOnce(new AppError(code));
    const result = await submitPolicyDraft("en", initial, data);
    expect(result.operationId).toBe(initial.operationId);
    expect(result.expectedRevision).toBe(9);
    expect(result.values).toEqual(initial.values);
    expect(result.outcome.kind).toBe(code === "outcome_unknown" ? "unknown" : "conflict");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  },
);
