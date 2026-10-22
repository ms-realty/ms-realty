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

it("compares exact repeated-hour instants in words without exposing ISO values", () => {
  const { container } = render(
    <WorkflowForm
      locale="en"
      action={async (state) => state}
      initialState={{
        operationId: "time-compare",
        expectedRevision: 1,
        responseId: "conflict",
        values: { dueAt: "2026-10-25T00:30:00.000Z" },
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: "Review the changed time",
          latest: { revision: 2, values: { dueAt: "2026-10-25T01:30:00.000Z" } },
        },
      }}
      fields={[{ name: "dueAt", label: "Follow-up", type: "datetime-local" }]}
      path="/en/cases/example"
      status={{ href: "/status", label: "Status" }}
      submit="Save"
    />,
  );
  expect(container.textContent).toMatch(/First, before the clocks change/);
  expect(container.textContent).toMatch(/Second, after the clocks change/);
  expect(container.textContent).not.toMatch(/2026-10-25T|Europe\/|UTC|GMT/);
});

it("retains a readable exact time when the transport response is lost", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const { container } = render(
      <WorkflowForm
        locale="en"
        action={async () => {
          throw new Error("Synthetic lost response");
        }}
        initialState={{
          operationId: "time-unknown",
          expectedRevision: 1,
          responseId: "initial",
          values: { dueAt: "2026-10-25T01:30:42.125Z" },
          outcome: { kind: "idle" },
        }}
        fields={[{ name: "dueAt", label: "Follow-up", type: "datetime-local" }]}
        path="/en/cases/example"
        status={{ href: "/status", label: "Status" }}
        submit="Save"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Second, after the clocks change/)).toBeVisible();
    expect(container.textContent).not.toMatch(
      /2026-10-25T|Europe\/|UTC|GMT|Synthetic lost response/,
    );
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute("href", "/status");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  } finally {
    error.mockRestore();
  }
});
