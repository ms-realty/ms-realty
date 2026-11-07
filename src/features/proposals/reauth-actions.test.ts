import { beforeEach, expect, it, vi } from "vitest";
import { publicLocales } from "@/domain/ids";
import { AppError } from "@/server/errors";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { proposalAction } from "./actions";
import { proposalScope } from "./contract";
import { proposalReauthCopy } from "./reauth-copy";

const mocked = vi.hoisted(() => ({
  save: vi.fn(),
  cookie: vi.fn(),
  decide: vi.fn(),
  host: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocked.host }));
vi.mock("@/server/http/next", async () => {
  const { toErrorBody } = await import("@/server/errors");
  const db = { transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  return {
    action: async (fn: (context: unknown) => Promise<unknown>) => {
      try {
        return {
          ok: true,
          data: await fn({
            db,
            session: { id: "session", account: { kind: "client", id: "client" } },
          }),
        };
      } catch (error) {
        return { ok: false, error: toErrorBody(error, "synthetic-request") };
      }
    },
  };
});
vi.mock("@/server/reauth-drafts/service", () => ({
  saveProposalReauthDraft: mocked.save,
  deleteProposalReauthDraft: mocked.clear,
}));
vi.mock("@/server/reauth-drafts/cookies", () => ({
  setProposalDraftCookie: mocked.cookie,
  proposalDraftToken: async () => "opaque-cookie",
}));
vi.mock("@/server/proposals/service", () => ({
  recordProposalDecision: mocked.decide,
  createProposal: vi.fn(),
  reviseProposal: vi.fn(),
  transitionProposal: vi.fn(),
}));

const id = "10000000-0000-4000-8000-000000000001";
const values = {
  revisionId: "20000000-0000-4000-8000-000000000002",
  state: "declined",
  reason: "  Synthetic private draft\nkeep spacing  ",
};
let previous: FormState<FormValues>;
function data(intent = "recover") {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    ...values,
    [formFields.intent]: intent,
    [formFields.operationId]: previous.operationId,
    [formFields.expectedRevision]: "3",
  }))
    form.set(name, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  previous = initialFormState(proposalScope("decide", id), values, 3);
  mocked.save.mockResolvedValue({ token: "opaque", expiresAt: new Date() });
  mocked.decide.mockRejectedValue(new AppError("step_up_required"));
});

it.each(publicLocales)(
  "C10 %s rejects stale submission without autosaving, then explicitly saves only response fields",
  async (locale) => {
    const rejected = await proposalAction("client", locale, "decide", id, previous, data("submit"));
    expect(rejected.outcome).toMatchObject({
      kind: "rejected",
      code: "STEP_UP_REQUIRED",
      recoverySubmit: { label: proposalReauthCopy(locale).save },
    });
    expect(mocked.save).not.toHaveBeenCalled();
    expect(mocked.cookie).not.toHaveBeenCalled();
    mocked.decide.mockClear();
    await expect(proposalAction("client", locale, "decide", id, previous, data())).rejects.toThrow(
      `REDIRECT /${locale}/access/reauth?returnTo=`,
    );
    expect(mocked.save.mock.calls[0]?.[3]).toEqual({
      ...values,
      proposalId: id,
      expectedVersion: 3,
    });
    expect(mocked.decide).not.toHaveBeenCalled();
    expect(mocked.cookie).toHaveBeenCalledOnce();
  },
);
it("keeps the allowlisted fields after a failed recovery save", async () => {
  mocked.save.mockRejectedValueOnce(new AppError("validation_failed"));
  const result = await proposalAction("client", "en", "decide", id, previous, data());
  expect(result.values).toEqual(values);
  expect(result.outcome).toMatchObject({
    kind: "rejected",
    recoverySubmit: { label: proposalReauthCopy("en").save },
  });
  expect(mocked.cookie).not.toHaveBeenCalled();
  expect(mocked.decide).not.toHaveBeenCalled();
});
it.each(["duplicate", "extra", "scope", "host"])(
  "denies %s recovery tampering without saving or executing",
  async (kind) => {
    const form = data();
    if (kind === "duplicate") form.append("reason", "second");
    if (kind === "extra") form.set("reviewed", "true");
    if (kind === "scope")
      form.set(
        formFields.operationId,
        initialFormState(proposalScope("revise", id), {}, 3).operationId,
      );
    if (kind === "host") mocked.host.mockRejectedValueOnce(new AppError("not_found"));
    await proposalAction("client", "en", "decide", id, previous, form);
    expect(mocked.save).not.toHaveBeenCalled();
    expect(mocked.decide).not.toHaveBeenCalled();
  },
);
it("does not admit other proposal commands to recovery", async () => {
  await proposalAction("client", "en", "revise", id, previous, data());
  expect(mocked.save).not.toHaveBeenCalled();
  expect(mocked.decide).not.toHaveBeenCalled();
});

it("keeps a committed command receipt truthful if exact-capability draft cleanup is unavailable", async () => {
  mocked.decide.mockResolvedValueOnce({
    outcome: { id, reference: "SYNTHETIC-RESPONSE", recordedAt: new Date().toISOString() },
  });
  mocked.clear.mockRejectedValueOnce(new Error("Synthetic private parameter must not be logged"));
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await proposalAction("client", "en", "decide", id, previous, data("submit"));
    expect(result.outcome.kind).toBe("confirmed");
    expect(mocked.decide).toHaveBeenCalledOnce();
    expect(mocked.clear.mock.calls[0]?.slice(2)).toEqual([id, "opaque-cookie"]);
    expect(errorLog.mock.calls).toEqual([["[proposal-draft] cleanup deferred"]]);
  } finally {
    errorLog.mockRestore();
  }
});
