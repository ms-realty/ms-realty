import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowForm } from "@/features/cases/form";
import { workCopy } from "@/features/work/copy";
import type { FormState } from "./contract";
import { ActionForm } from "./form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const boundId = "d84c1e58-72df-4cd6-9e92-faf76c5c80d2";

it("keeps the readable draft and same-request link when transport fails, with metadata disclosed", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const copy = workCopy("en").form;
  const action = vi.fn(async () => {
    throw new Error("Synthetic lost transport");
  });
  render(
    <ActionForm
      action={action}
      initialState={{
        operationId: "opaque-operation-reference",
        expectedRevision: 1,
        responseId: "initial",
        values: { note: "Readable retained draft", boundId },
        outcome: { kind: "idle" },
      }}
      permalink="/en/proposals/example"
      reconciliation={{
        href: "/en/proposals/operations?same=request",
        label: "Check this request",
      }}
      labels={{ note: "Your note", boundId: "" }}
      copy={copy}
      submitLabel="Save draft"
    >
      {(form) => (
        <>
          <input name="note" value={form.values.note} onChange={() => {}} />
          <input name="boundId" type="hidden" value={form.values.boundId} />
        </>
      )}
    </ActionForm>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(copy.unknown)).toBeVisible();
  expect(screen.getByText("Readable retained draft")).toBeVisible();
  expect(screen.getByText("opaque-operation-reference")).not.toBeVisible();
  expect(screen.getByText(boundId)).not.toBeVisible();
  expect(screen.getByRole("link", { name: "Check this request" })).toHaveAttribute(
    "href",
    "/en/proposals/operations?same=request",
  );
  expect(action).toHaveBeenCalledOnce();
});

it("compares choice labels while keeping bound IDs and revision counters in technical details", () => {
  const initial: FormState<{ owner: string; hiddenReference: string }> = {
    operationId: "opaque-operation-reference",
    expectedRevision: 1,
    responseId: "conflict",
    values: { owner: boundId, hiddenReference: "opaque-binding-reference" },
    outcome: {
      kind: "conflict",
      code: "REVISION_CONFLICT",
      message: "Someone changed the record. Review it before continuing.",
      latest: {
        revision: 12,
        values: { owner: boundId, hiddenReference: "opaque-binding-reference" },
      },
    },
  };
  render(
    <WorkflowForm
      locale="en"
      action={async (state) => state}
      initialState={initial}
      fields={[
        {
          name: "owner",
          label: "Responsible person",
          type: "select",
          options: [{ value: boundId, label: "Synthetic broker" }],
        },
        { name: "hiddenReference", label: "", type: "hidden" },
      ]}
      path="/en/proposals/example"
      status={{ href: "/en/proposals/operations?same=request", label: "Check this request" }}
      submit="Save reviewed choice"
    />,
  );
  expect(screen.getByText(/Your draft: Synthetic broker/)).toBeVisible();
  expect(screen.getByText(/Latest value: Synthetic broker/)).toBeVisible();
  expect(screen.getByText("Revision: 12")).not.toBeVisible();
  for (const node of screen.getAllByText("opaque-binding-reference", { exact: false }))
    expect(node).not.toBeVisible();
});
