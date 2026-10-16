import { redirect } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import { publicLocales } from "@/domain/ids";
import { moneyCopy } from "@/i18n/money-copy";
import { AppError } from "@/server/errors";
import { termInputSchema } from "@/server/proposals/terms";
import type { FormState, FormValues } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import { proposalAction } from "./actions";
import { proposalEnhancementField, proposalScope, proposalStatus } from "./contract";

const mocked = vi.hoisted(() => ({
  create: vi.fn(),
  revise: vi.fn(),
  host: vi.fn(),
  session: { account: { kind: "client" } },
}));
// The command service retains its permission/business checks. This adapter check exercises
// the native FormData and signed form envelope up to that existing command boundary.
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
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocked.host }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT ${href}`);
  }),
}));
vi.mock("@/server/proposals/service", () => ({
  createProposal: mocked.create,
  reviseProposal: mocked.revise,
  recordProposalDecision: vi.fn(),
  transitionProposal: vi.fn(),
}));

const id = "10000000-0000-4000-8000-000000000001";
const previous: FormState<FormValues> = {
  operationId: "unused-previous-operation",
  expectedRevision: 4,
  responseId: "previous",
  values: {},
  outcome: { kind: "idle" },
};
function submission(command: "create" | "revise", amount: string, currency = "EUR") {
  const operationId = issueFormOperation(proposalScope(command, id));
  const data = new FormData();
  for (const [name, value] of Object.entries({
    [formFields.operationId]: operationId,
    [formFields.expectedRevision]: "4",
    [formFields.intent]: "submit",
    interestId: "20000000-0000-4000-8000-000000000002",
    revisionId: "30000000-0000-4000-8000-000000000003",
    clientPartyId: "40000000-0000-4000-8000-000000000004",
    additionalPartyIds: "50000000-0000-4000-8000-000000000005",
    amount,
    currency,
    period: "total",
    paymentBasis: "Synthetic exact terms",
    conditions: "Reviewed condition",
    inclusions: "Recorded inclusion",
    deadline: "2026-10-25T18:30:00+02:00",
    reason: "Synthetic revised terms",
  }))
    data.set(name, value);
  return { data, operationId };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.session.account.kind = "client";
  const execute = async (_db: unknown, _session: unknown, input: unknown) => {
    const parsed = termInputSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError("validation_failed", { fieldErrors: { amountMinor: ["Invalid amount"] } });
    return { outcome: { id, reference: "SYNTHETIC-PROPOSAL", recordedAt: "2026-10-16T12:00:00Z" } };
  };
  mocked.create.mockImplementation(execute);
  mocked.revise.mockImplementation(execute);
});

it("opens the durable operation status after a successful native client counteroffer", async () => {
  const { data, operationId } = submission("revise", "119,000.03");
  await expect(proposalAction("client", "en", "revise", id, previous, data)).rejects.toThrow(
    `REDIRECT ${proposalStatus("en", "revise", id, operationId)}`,
  );
  expect(mocked.revise).toHaveBeenCalledOnce();
});

const moneyEntries = [
  ["bg", "90\u00a0071\u00a0992\u00a0547\u00a0409,91"],
  ["en", "90,071,992,547,409.91"],
  ["ru", "90 071 992 547 409,91"],
  ["de", "90.071.992.547.409,91"],
  ["nl", "90.071.992.547.409,91"],
  ["el", "90.071.992.547.409,91"],
  ["he", "90,071,992,547,409.91"],
] as const;
it.each(moneyEntries)(
  "reads a native %s counteroffer exactly with unchanged binding values",
  async (locale, amount) => {
    const { data, operationId } = submission("revise", amount, "GBP");
    await expect(proposalAction("client", locale, "revise", id, previous, data)).rejects.toThrow(
      `REDIRECT ${proposalStatus(locale, "revise", id, operationId)}`,
    );
    expect(mocked.host).toHaveBeenCalledWith("client");
    expect(mocked.revise).toHaveBeenCalledWith(
      "synthetic-db",
      mocked.session,
      expect.objectContaining({
        id,
        operationId,
        expectedVersion: 4,
        revisionId: data.get("revisionId"),
        clientPartyId: data.get("clientPartyId"),
        additionalPartyIds: [data.get("additionalPartyIds")],
        amountMinor: Number.MAX_SAFE_INTEGER,
        currency: "GBP",
        reason: "Synthetic revised terms",
      }),
    );
  },
);

it.each(moneyEntries)(
  "keeps the enhanced %s counteroffer receipt and exact draft",
  async (locale, amount) => {
    const { data, operationId } = submission("revise", amount, "GBP");
    data.set(proposalEnhancementField, "yes");
    const state = await proposalAction("client", locale, "revise", id, previous, data);
    expect(redirect).not.toHaveBeenCalled();
    expect(mocked.revise.mock.calls[0]?.[2]).toMatchObject({
      operationId,
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: "GBP",
    });
    expect(state.values.amount).toBe(amount);
    expect(state.outcome).toMatchObject({
      kind: "confirmed",
      receipt: { destination: { href: `/${locale}/proposals/${id}` } },
    });
  },
);

it.each(["bg", "en", "ru"] as const)(
  "uses the same exact reader for a staff %s draft",
  async (locale) => {
    mocked.session.account.kind = "staff";
    const amount = locale === "en" ? "123,456.79" : "123 456,79";
    const { data } = submission("create", amount, "USD");
    const state = await proposalAction("staff", locale, "create", id, previous, data);
    expect(state.outcome.kind).toBe("confirmed");
    expect(mocked.host).toHaveBeenCalledWith("staff");
    expect(mocked.create.mock.calls[0]?.[2]).toMatchObject({
      amountMinor: 12345679,
      currency: "USD",
    });
  },
);

it.each(publicLocales)(
  "keeps invalid precision and localized %s feedback without rounding",
  async (locale) => {
    const amount = ["en", "he"].includes(locale) ? "1000.001" : "1000,001";
    const { data, operationId } = submission("revise", amount);
    const state = await proposalAction("client", locale, "revise", id, previous, data);
    expect(mocked.revise.mock.calls[0]?.[2].amountMinor).toBeNaN();
    expect(state.values.amount).toBe(amount);
    expect(state.operationId).not.toBe(operationId);
    expect(state.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { amount: [moneyCopy(locale).invalid] },
    });
    expect(redirect).not.toHaveBeenCalled();
  },
);

it("keeps the existing positive amount and declared currency checks", async () => {
  for (const [amount, currency] of [
    ["0.00", "EUR"],
    ["123.00", "XYZ"],
  ]) {
    const { data } = submission("revise", amount ?? "", currency);
    const state = await proposalAction("client", "en", "revise", id, previous, data);
    expect(state.outcome.kind).toBe("validation");
  }
});

it.each(["", "yes"])(
  "retains the exact unknown counteroffer and operation with enhancement %j",
  async (enhanced) => {
    const { data, operationId } = submission("revise", "119,000.03");
    if (enhanced) data.set(proposalEnhancementField, enhanced);
    mocked.revise.mockRejectedValueOnce(new AppError("outcome_unknown"));
    const state = await proposalAction("client", "en", "revise", id, previous, data);
    expect(redirect).not.toHaveBeenCalled();
    expect(mocked.revise).toHaveBeenCalledOnce();
    expect(state.operationId).toBe(operationId);
    expect(state.values.amount).toBe("119,000.03");
    expect(state.outcome).toMatchObject({
      kind: "unknown",
      status: { href: proposalStatus("en", "revise", id, operationId) },
    });
  },
);

it("keeps a native staff revision on its existing receipt", async () => {
  mocked.session.account.kind = "staff";
  const { data } = submission("revise", "119,000.03");
  const state = await proposalAction("staff", "en", "revise", id, previous, data);
  expect(state.outcome.kind).toBe("confirmed");
  expect(redirect).not.toHaveBeenCalled();
});

it("uses the enhancement hint only after the existing host and revision gates", async () => {
  const { data } = submission("revise", "119,000.03");
  data.set(proposalEnhancementField, "yes");
  mocked.host.mockRejectedValueOnce(new AppError("forbidden"));
  const denied = await proposalAction("client", "en", "revise", id, previous, data);
  expect(denied.outcome).toMatchObject({ kind: "rejected", code: "NOT_AUTHORIZED" });
  expect(mocked.revise).not.toHaveBeenCalled();
  data.set(formFields.expectedRevision, "invalid");
  const invalid = await proposalAction("client", "en", "revise", id, previous, data);
  expect(invalid.outcome.kind).toBe("validation");
  expect(mocked.revise).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
