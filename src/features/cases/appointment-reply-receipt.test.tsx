import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import { workflowAction } from "./actions";
import { workflowScope, workflowStatus } from "./contract";
import { caseCopy } from "./copy";
import { WorkflowStatusScreen } from "./screens";

const mocked = vi.hoisted(() => ({
  appointment: vi.fn(),
  receipt: vi.fn(),
  reply: vi.fn(),
  case: vi.fn(),
  host: vi.fn(),
  session: {
    account: { kind: "client", id: "synthetic-client" },
    actor: { kind: "client", id: "synthetic-client" },
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => "synthetic-db" }));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocked.host }));
vi.mock("@/server/cases/shared", () => ({ caseFor: mocked.case }));
vi.mock("@/server/appointments/service", () => ({
  readAppointment: mocked.appointment,
  listAppointments: vi.fn(),
  arrangeAppointment: vi.fn(),
  requestAppointment: vi.fn(),
  respondToAppointment: vi.fn(),
  recordAppointmentVersion: vi.fn(),
}));
vi.mock("@/server/appointments/participant-response", () => ({
  respondToProposedSlot: mocked.reply,
}));
vi.mock("@/server/operations", () => ({ findOperation: mocked.receipt, runOperation: vi.fn() }));
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
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: vi.fn(),
}));

const id = "10000000-0000-4000-8000-000000000001";
const session = mocked.session as Session;
const copy = caseCopy("en");
const outcome = {
  id,
  version: 3,
  reference: "SYNTHETIC-APPOINTMENT",
  recordedAt: "2030-01-01T00:00:00Z",
};
const proposed = { id, state: "proposed", version: 3, confirmedStartsAt: null };
const previous: FormState<FormValues> = {
  operationId: "unused-previous-operation",
  expectedRevision: 2,
  responseId: "previous",
  values: {},
  outcome: { kind: "idle" },
};
function submission() {
  const operationId = issueFormOperation(workflowScope("appointmentReply", id));
  const data = new FormData();
  data.set(formFields.operationId, operationId);
  data.set(formFields.expectedRevision, "2");
  data.set(formFields.intent, "submit");
  data.set("decision", "accept");
  data.set("note", "Exact synthetic participant response");
  return { operationId, data };
}
function status(operationKey: string) {
  return { locale: "en", session, command: "appointmentReply", id, operationKey };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.appointment.mockResolvedValue({
    appointment: proposed,
    ownResponse: { decision: "accept" },
  });
  mocked.receipt.mockResolvedValue({ status: "succeeded", outcome });
  mocked.reply.mockResolvedValue({ outcome });
});
afterEach(cleanup);

it("C06 opens the appointment from the successful participant response and its actor-bound receipt", async () => {
  const { data, operationId } = submission();
  const result = await workflowAction("client", "en", "appointmentReply", id, previous, data);
  expect(result).toMatchObject({
    operationId,
    expectedRevision: 2,
    outcome: { kind: "confirmed", receipt: { destination: { href: `/en/appointments/${id}` } } },
  });
  expect(mocked.host).toHaveBeenCalledWith("client");
  expect(mocked.reply).toHaveBeenCalledWith("synthetic-db", session, {
    id,
    operationId,
    expectedVersion: 2,
    decision: "accept",
    note: "Exact synthetic participant response",
  });
  render(await WorkflowStatusScreen(status(operationId)));
  expect(mocked.appointment).toHaveBeenCalledWith("synthetic-db", session, id);
  expect(mocked.receipt).toHaveBeenCalledWith(
    "synthetic-db",
    session.actor,
    "appointment.participant.respond",
    operationId,
  );
  expect(mocked.appointment.mock.invocationCallOrder[0]).toBeLessThan(
    mocked.receipt.mock.invocationCallOrder[0] ?? 0,
  );
  expect(screen.getByText(copy.statusSaved)).toBeVisible();
  expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
    "href",
    `/en/appointments/${id}`,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(mocked.case).not.toHaveBeenCalled();
  expect(mocked.reply).toHaveBeenCalledOnce();
  expect(proposed).toMatchObject({ state: "proposed", version: 3, confirmedStartsAt: null });
});

it("C06 keeps the original unknown response key and draft, then recovers to the same appointment without resubmitting", async () => {
  const { data, operationId } = submission();
  mocked.reply.mockRejectedValueOnce(new AppError("outcome_unknown"));
  const result = await workflowAction("client", "en", "appointmentReply", id, previous, data);
  const receiptPath = workflowStatus("client", "en", "appointmentReply", id, operationId);
  expect(result).toMatchObject({
    operationId,
    expectedRevision: 2,
    values: { decision: "accept", note: "Exact synthetic participant response" },
    outcome: { kind: "unknown", status: { href: receiptPath } },
  });
  mocked.receipt.mockResolvedValueOnce({ status: "outcome_unknown", outcome: null });
  render(await WorkflowStatusScreen(status(operationId)));
  expect(screen.getByRole("link", { name: copy.checkAgain })).toHaveAttribute("href", receiptPath);
  expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
    "href",
    `/en/appointments/${id}`,
  );
  cleanup();
  render(await WorkflowStatusScreen(status(operationId)));
  expect(screen.getByText(copy.statusSaved)).toBeVisible();
  expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
    "href",
    `/en/appointments/${id}`,
  );
  expect(mocked.receipt.mock.calls.map((call) => [call[1], call[2], call[3]])).toEqual([
    [session.actor, "appointment.participant.respond", operationId],
    [session.actor, "appointment.participant.respond", operationId],
  ]);
  expect(mocked.reply).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(proposed).toMatchObject({ state: "proposed", confirmedStartsAt: null });
});

it("C06 rechecks current appointment access before reading a known reply receipt", async () => {
  const { operationId } = submission();
  mocked.appointment.mockRejectedValueOnce(new AppError("not_found"));
  await expect(WorkflowStatusScreen(status(operationId))).rejects.toThrow("NOT_FOUND");
  expect(mocked.receipt).not.toHaveBeenCalled();
  expect(mocked.reply).not.toHaveBeenCalled();
});

it("C06 rejects a forged reply operation before appointment or receipt readback", async () => {
  await expect(WorkflowStatusScreen(status("forged-operation"))).rejects.toThrow("NOT_FOUND");
  expect(mocked.appointment).not.toHaveBeenCalled();
  expect(mocked.receipt).not.toHaveBeenCalled();
  expect(mocked.reply).not.toHaveBeenCalled();
});
