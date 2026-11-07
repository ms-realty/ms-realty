import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { issueFormOperation } from "@/ui/form/server";
import { workflowAction } from "./actions";
import { workflowScope, workflowStatus } from "./contract";
import { WorkflowForm } from "./form";

const mocked = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  acceptHost: vi.fn(),
  offerHost: vi.fn(),
  authHost: vi.fn(),
  session: { account: { kind: "client" } },
}));
// Execute the action adapter and signed form envelope, stopping at the command boundary.
// The real owner-preview and host-handover commands require fresh authentication there.
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
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocked.authHost }));
vi.mock("@/server/cases/owner-preview", () => ({
  acknowledgeOwnerPreview: mocked.acknowledge,
  bindSellerCase: vi.fn(),
}));
vi.mock("@/server/appointments/host-handover", () => ({
  acceptAppointmentHost: mocked.acceptHost,
}));
vi.mock("@/server/appointments/host-offer", () => ({ offerAppointmentHost: mocked.offerHost }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  for (const command of [mocked.acknowledge, mocked.acceptHost, mocked.offerHost])
    command.mockRejectedValue(new AppError("step_up_required"));
});

const languages = [
  [
    "bg",
    "Потвърдете самоличността си отново. Черновата ви е запазена.",
    "Потвърдете самоличността си",
  ],
  ["en", "Confirm your identity again. Your draft is retained.", "Confirm your identity"],
  ["ru", "Подтвердите свою личность ещё раз. Ваш черновик сохранён.", "Подтвердить личность"],
  [
    "de",
    "Bestätigen Sie Ihre Identität erneut. Ihr Entwurf bleibt erhalten.",
    "Identität bestätigen",
  ],
  ["nl", "Bevestig uw identiteit opnieuw. Uw concept blijft behouden.", "Identiteit bevestigen"],
  [
    "el",
    "Επιβεβαιώστε ξανά την ταυτότητά σας. Το πρόχειρό σας διατηρείται.",
    "Επιβεβαίωση ταυτότητας",
  ],
  ["he", "יש לאמת שוב את הזהות. הטיוטה שלכם נשמרת.", "אימות הזהות"],
] as const;
const id = "10000000-0000-4000-8000-000000000001";
const previous: FormState<FormValues> = {
  operationId: "unused-previous-operation",
  expectedRevision: 4,
  responseId: "previous",
  values: {},
  outcome: { kind: "idle" },
};

it.each(languages)(
  "C01 / S15 localizes %s fresh-auth recovery and retains the owner-preview draft",
  async (locale, message, label) => {
    mocked.session.account.kind = "client";
    const operationId = issueFormOperation(workflowScope("ownerAcknowledge", id));
    const values = {
      reference: "SYNTHETIC-OWNER-123",
      previewHash: "synthetic-exact-hash",
      reviewed: "true",
    };
    const data = new FormData();
    for (const [name, value] of Object.entries({
      ...values,
      [formFields.operationId]: operationId,
      [formFields.expectedRevision]: "4",
      [formFields.intent]: "submit",
    }))
      data.set(name, value);
    const state = await workflowAction("client", locale, "ownerAcknowledge", id, previous, data);
    const href = `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/overview/${id}`)}`;
    expect(mocked.authHost).toHaveBeenCalledWith("client");
    expect(mocked.acknowledge).toHaveBeenCalledExactlyOnceWith("synthetic-db", mocked.session, {
      id,
      operationId,
      expectedVersion: 4,
      ...values,
      reviewed: true,
    });
    expect(state).toMatchObject({ operationId, expectedRevision: 4, values });
    expect(state.reconciliation?.href).toBe(
      workflowStatus("client", locale, "ownerAcknowledge", id, operationId),
    );
    expect(state.outcome).toEqual({
      kind: "rejected",
      code: "STEP_UP_REQUIRED",
      message,
      retryable: false,
      recovery: { href, label },
    });
    render(
      <WorkflowForm
        locale={locale}
        action={async (state) => state}
        initialState={state}
        fields={[{ name: "reference", label: "Synthetic source reference" }]}
        path={`/${locale}/overview/${id}`}
        status={{ href: state.reconciliation?.href ?? "", label: "Synthetic status link" }}
        submit="Synthetic submit"
      />,
    );
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    expect(screen.getByRole("textbox")).toHaveValue(values.reference);
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);

it.each(languages.slice(0, 3))(
  "S15 localizes %s staff host recovery without changing the destination or draft rules",
  async (locale, message, label) => {
    mocked.session.account.kind = "staff";
    for (const command of ["appointmentHost", "appointmentHostHandover"] as const) {
      const operationId = issueFormOperation(workflowScope(command, id));
      const data = new FormData();
      for (const [name, value] of Object.entries({
        [formFields.operationId]: operationId,
        [formFields.expectedRevision]: "4",
        [formFields.intent]: "submit",
        reason: "Exact source reason / MS-00123",
        reviewed: "true",
        externalBusyChecked: "true",
        propertyAccessConfirmed: "true",
        action: "offer",
        receiverId: "20000000-0000-4000-8000-000000000002",
      }))
        data.set(name, value);
      const state = await workflowAction("staff", locale, command, id, previous, data);
      expect(mocked.authHost).toHaveBeenCalledWith("staff");
      expect(
        command === "appointmentHost" ? mocked.acceptHost : mocked.offerHost,
      ).toHaveBeenCalledOnce();
      expect(state.operationId).toBe(operationId);
      expect(state.values.reason).toBe("Exact source reason / MS-00123");
      // Host acceptance deliberately clears its three attestations after every response.
      expect(state.values.reviewed).toBe(command === "appointmentHost" ? "" : "true");
      expect(state.outcome).toEqual({
        kind: "rejected",
        code: "STEP_UP_REQUIRED",
        message,
        retryable: false,
        recovery: {
          href: `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/calendar/${id}`)}`,
          label,
        },
      });
    }
  },
);
