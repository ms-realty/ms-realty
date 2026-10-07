import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { formFields } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import { inquiryLinkScope } from "./inquiry-link-contract";
import { inquiryLinkCopy } from "./inquiry-link-copy";

const mocked = vi.hoisted(() => ({
  link: vi.fn(),
  session: { account: { kind: "staff", id: "10000000-0000-4000-8000-000000000001" } },
}));
// The command, origin and session checks have their own tests; this covers what the O03L form
// shows for each outcome of the real command contract.
vi.mock("@/server/http/next", async () => {
  const { toErrorBody } = await import("@/server/errors");
  return {
    action: async (fn: (ctx: unknown) => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn({ db: {}, session: mocked.session }) };
      } catch (error) {
        return { ok: false, error: toErrorBody(error, "test") };
      }
    },
  };
});
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: async () => {} }));
vi.mock("@/server/cases/commands", () => ({ linkInquiryToExistingCase: mocked.link }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

import { linkInquiryAction } from "./inquiry-link-actions";

const inquiryId = "20000000-0000-4000-8000-000000000002";
const caseId = "30000000-0000-4000-8000-000000000003";
const copy = inquiryLinkCopy("bg");
const idle = {
  operationId: "",
  expectedRevision: 3,
  values: { caseId, expectedCaseVersion: "2" },
  responseId: "",
  outcome: { kind: "idle" },
} as const;

function submission(operationId = issueFormOperation(inquiryLinkScope(inquiryId))) {
  const data = new FormData();
  data.set(formFields.operationId, operationId);
  data.set(formFields.expectedRevision, "3");
  data.set(formFields.intent, "submit");
  data.set("caseId", caseId);
  data.set("expectedCaseVersion", "2");
  return { data, operationId };
}

// A block body: a returned function would run as a cleanup hook and call the mock again.
beforeEach(() => {
  mocked.link.mockReset();
});

describe("O03L link action", () => {
  it("sends the reviewed versions and opens the actor's own result", async () => {
    mocked.link.mockResolvedValue({ outcome: { id: inquiryId } });
    const { data, operationId } = submission();
    await expect(linkInquiryAction("bg", inquiryId, idle, data)).rejects.toThrow(
      `REDIRECT /bg/inquiries/${inquiryId}/link?key=${encodeURIComponent(operationId)}`,
    );
    expect(mocked.link).toHaveBeenCalledWith({}, mocked.session, {
      id: inquiryId,
      operationId,
      expectedVersion: 3,
      caseId,
      expectedCaseVersion: 2,
    });
  });

  it.each(["version_conflict", "idempotency_key_reused"] as const)(
    "blocks a %s as a conflict that only offers a fresh review",
    async (code) => {
      mocked.link.mockRejectedValue(new AppError(code));
      const state = await linkInquiryAction("bg", inquiryId, idle, submission().data);
      expect(state.outcome).toEqual({
        kind: "conflict",
        code: code === "version_conflict" ? "REVISION_CONFLICT" : "IDEMPOTENCY_KEY_REUSED",
        message: copy.conflict,
        recovery: {
          href: `/bg/inquiries/${inquiryId}/link?case=${caseId}`,
          label: copy.reloadReview,
        },
      });
    },
  );

  it.each([
    ["forbidden", copy.denied],
    ["not_found", copy.missing],
    ["transition_denied", copy.unavailable],
  ] as const)("names a %s refusal truthfully and keeps the form blocked", async (code, message) => {
    mocked.link.mockRejectedValue(new AppError(code));
    const state = await linkInquiryAction("bg", inquiryId, idle, submission().data);
    expect(state.outcome).toMatchObject({ kind: "rejected", message, retryable: false });
  });

  it("keeps an unknown outcome on its own status instead of offering a new link", async () => {
    mocked.link.mockRejectedValue(new AppError("operation_pending"));
    const { data, operationId } = submission();
    const state = await linkInquiryAction("bg", inquiryId, idle, data);
    expect(state.outcome).toEqual({
      kind: "unknown",
      code: "OUTCOME_UNKNOWN",
      message: copy.unknown,
      status: {
        href: `/bg/inquiries/${inquiryId}/link?key=${encodeURIComponent(operationId)}`,
        label: copy.checkStatus,
      },
    });
  });

  it("refuses a key issued for another inquiry before calling the command", async () => {
    const forged = submission(issueFormOperation(inquiryLinkScope(caseId)));
    const state = await linkInquiryAction("bg", inquiryId, idle, forged.data);
    expect(state.outcome).toMatchObject({ kind: "rejected", message: copy.invalid });
    expect(mocked.link).not.toHaveBeenCalled();
    await expect(linkInquiryAction("de", inquiryId, idle, submission().data)).rejects.toThrow(
      "not_found",
    );
  });
});
