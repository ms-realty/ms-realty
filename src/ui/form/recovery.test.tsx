import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FormAction, FormState } from "./contract";
import { ActionForm } from "./form";
import { formSpecimenCopy } from "./specimen-copy";

afterEach(cleanup);
it("UX S08 explicitly posts current response fields, keeps failed recovery editable, and blocks business submit", async () => {
  const initial: FormState<{ state: string; reason: string }> = {
    operationId: "signed-operation",
    expectedRevision: 3,
    responseId: "rejected",
    values: { state: "declined", reason: "Original synthetic reason" },
    outcome: {
      kind: "rejected",
      code: "STEP_UP_REQUIRED",
      message: "Verify access",
      retryable: false,
      recoverySubmit: { label: "Save draft and verify" },
    },
  };
  const action = vi.fn<FormAction<typeof initial.values>>(async (previous, data) => ({
    ...previous,
    responseId: "failed-recovery",
    values: { state: String(data.get("state")), reason: String(data.get("reason")) },
    outcome: {
      ...initial.outcome,
      kind: "rejected",
      code: "VALIDATION_FAILED",
      message: "Save failed",
      retryable: false,
      recoverySubmit: { label: "Save draft and verify" },
    },
  }));
  render(
    <ActionForm
      action={action}
      initialState={initial}
      permalink="/en/proposals/synthetic"
      reconciliation={{ href: "/status", label: "Status" }}
      copy={formSpecimenCopy("en").form}
      labels={{ state: "Response", reason: "Reason" }}
      submitLabel="Record response"
    >
      {(form) => (
        <>
          <label>
            Response
            <select {...form.field("state")} disabled={form.field("state").readOnly}>
              <option value="declined">Decline</option>
              <option value="agreed_for_next_step">Agree</option>
            </select>
          </label>
          <label>
            Reason
            <textarea {...form.field("reason")} />
          </label>
        </>
      )}
    </ActionForm>,
  );
  expect(screen.queryByRole("button", { name: "Record response" })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Response"), "agreed_for_next_step");
  await userEvent.clear(screen.getByLabelText("Reason"));
  await userEvent.type(screen.getByLabelText("Reason"), "Updated synthetic reason");
  await userEvent.click(screen.getByRole("button", { name: "Save draft and verify" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].get("_intent")).toBe("recover");
  expect(action.mock.calls[0]?.[1].get("state")).toBe("agreed_for_next_step");
  expect(screen.getByLabelText("Reason")).toHaveValue("Updated synthetic reason");
  expect(screen.getByLabelText("Response")).not.toBeDisabled();
  expect(screen.queryByRole("button", { name: "Record response" })).not.toBeInTheDocument();
});
