import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FormAction, FormValues } from "@/ui/form/contract";
import { WorkflowForm } from "./form";

afterEach(cleanup);
it("submits every checked party and restores the selection after a hydrated validation response", async () => {
  const action = vi.fn<FormAction<FormValues>>(async (state, data) => ({
    ...state,
    responseId: "review-parties",
    values: { parties: data.getAll("parties").join("\n") },
    outcome: {
      kind: "validation",
      code: "VALIDATION_FAILED",
      message: "Review parties",
      fieldErrors: { parties: ["Review the selected parties"] },
    },
  }));
  render(
    <WorkflowForm
      locale="en"
      action={action}
      initialState={{
        operationId: "synthetic-form-operation",
        expectedRevision: 1,
        responseId: "initial",
        values: { parties: "one" },
        outcome: { kind: "idle" },
      }}
      fields={[
        {
          name: "parties",
          label: "Additional parties",
          type: "checkbox-group",
          options: [
            { value: "one", label: "First buyer" },
            { value: "two", label: "Second buyer" },
          ],
        },
      ]}
      path="/en/proposals/test"
      status={{ href: "/status", label: "Status" }}
      submit="Save revision"
    />,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Second buyer" }));
  await userEvent.click(screen.getByRole("button", { name: "Save revision" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].getAll("parties")).toEqual(["one", "two"]);
  expect(screen.getByRole("checkbox", { name: "First buyer" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Second buyer" })).toBeChecked();
  expect(screen.getByRole("group", { name: "Additional parties" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
