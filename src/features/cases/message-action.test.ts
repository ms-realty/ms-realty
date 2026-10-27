import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import { workflowAction } from "./actions";
import { workflowScope, workflowStatus } from "./contract";

const mocked = vi.hoisted(() => ({
  post: vi.fn(),
  host: vi.fn(),
  session: { account: { kind: "client" } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocked.host }));
vi.mock("@/server/http/next", async () => {
  const { toErrorBody } = await import("@/server/errors");
  return {
    action: async (fn: (ctx: unknown) => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn({ db: "synthetic-db", session: mocked.session }) };
      } catch (error) {
        return { ok: false, error: toErrorBody(error, "synthetic-request") };
      }
    },
  };
});
vi.mock("@/server/cases/commands", () => ({
  postCaseMessage: mocked.post,
  addInterest: vi.fn(),
  createCaseFromInquiry: vi.fn(),
  respondToInterest: vi.fn(),
  reviseBrief: vi.fn(),
  updateNextAction: vi.fn(),
}));

const id = "10000000-0000-4000-8000-000000000001";
const previous: FormState<FormValues> = {
  operationId: "unused-previous-operation",
  expectedRevision: 4,
  responseId: "previous",
  values: {},
  outcome: { kind: "idle" },
};
function submission() {
  const operationId = issueFormOperation(workflowScope("message", id));
  const data = new FormData();
  data.set(formFields.operationId, operationId);
  data.set(formFields.expectedRevision, "4");
  data.set(formFields.intent, "submit");
  data.set("body", "Exact synthetic message draft");
  return { operationId, data };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.post.mockResolvedValue({
    outcome: { id, version: 5, reference: "SYNTHETIC-CASE", recordedAt: "2026-10-16T12:00:00Z" },
  });
});

it("C07 clears only a committed message, advances the revision and revalidates the conversation once", async () => {
  const { data, operationId } = submission();
  const state = await workflowAction("client", "he", "message", id, previous, data);
  expect(mocked.post).toHaveBeenCalledWith(
    "synthetic-db",
    mocked.session,
    expect.objectContaining({
      id,
      operationId,
      expectedVersion: 4,
      body: "Exact synthetic message draft",
      audience: "case_participants",
    }),
  );
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(`/he/messages/${id}`);
  expect(redirect).not.toHaveBeenCalled();
  expect(state.operationId).not.toBe(operationId);
  expect(state).toMatchObject({
    expectedRevision: 5,
    values: { body: "" },
    outcome: { kind: "idle" },
  });
});

it("C07 retains the same operation and draft through an unknown response and recovers that operation", async () => {
  const { data, operationId } = submission();
  mocked.post.mockRejectedValueOnce(new AppError("outcome_unknown"));
  const unknown = await workflowAction("client", "en", "message", id, previous, data);
  expect(unknown).toMatchObject({
    operationId,
    expectedRevision: 4,
    values: { body: "Exact synthetic message draft" },
    outcome: {
      kind: "unknown",
      status: { href: workflowStatus("client", "en", "message", id, operationId) },
    },
  });
  expect(revalidatePath).not.toHaveBeenCalled();
  const recovered = await workflowAction("client", "en", "message", id, unknown, data);
  expect(mocked.post.mock.calls.map((call) => call[2].operationId)).toEqual([
    operationId,
    operationId,
  ]);
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(`/en/messages/${id}`);
  expect(recovered.values.body).toBe("");
  expect(recovered.operationId).not.toBe(operationId);
});

it("C07 retains an authorized draft and operation when the host or current grant rejects the send", async () => {
  const { data, operationId } = submission();
  mocked.host.mockRejectedValueOnce(new AppError("forbidden"));
  const state = await workflowAction("client", "en", "message", id, previous, data);
  expect(state).toMatchObject({
    operationId,
    values: { body: "Exact synthetic message draft" },
    outcome: { kind: "rejected", code: "NOT_AUTHORIZED" },
  });
  expect(mocked.post).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});
