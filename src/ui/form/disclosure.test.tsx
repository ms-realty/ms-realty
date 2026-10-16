import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import type { FormAction, FormOutcome, FormState, FormValues } from "./contract";
import { ActionForm } from "./form";
import { formSpecimenCopy } from "./specimen-copy";

afterEach(cleanup);
const initial: FormState<FormValues> = {
  operationId: "synthetic-disclosure",
  expectedRevision: 1,
  responseId: "initial",
  values: { note: "Retained terms" },
  outcome: { kind: "idle" },
};
const validation: FormOutcome<FormValues> = {
  kind: "validation",
  code: "VALIDATION_FAILED",
  message: "Review terms",
  fieldErrors: { note: ["Give a reason"] },
};
const confirmed: FormOutcome<FormValues> = {
  kind: "confirmed",
  receipt: {
    title: "Revision recorded",
    reference: "SYNTHETIC-REVISION",
    recordedAt: { dateTime: "2026-10-16T12:00:00Z", label: "Recorded just now" },
    nextStep: "Await the required review",
    destination: { href: "/proposal", label: "Proposal" },
  },
};
function DisclosureForm({
  state = initial,
  action = async (current) => current,
}: {
  state?: FormState<FormValues>;
  action?: FormAction<FormValues>;
}) {
  return (
    <ActionForm
      initialState={state}
      action={action}
      permalink="/proposal"
      reconciliation={{ href: "/status", label: "Status" }}
      copy={formSpecimenCopy("en").form}
      labels={{ note: "Reason" }}
      submitLabel="Submit counteroffer"
      disclosure="Propose revised terms"
    >
      {(form) => (
        <label>
          Reason
          <input {...form.field("note")} />
        </label>
      )}
    </ActionForm>
  );
}

it.each([
  validation,
  { kind: "rejected", code: "FORBIDDEN", message: "Not recorded", retryable: false },
  { kind: "conflict", code: "REVISION_CONFLICT", message: "Terms changed" },
  {
    kind: "unknown",
    code: "OUTCOME_UNKNOWN",
    message: "Check result",
    status: { href: "/status", label: "Status" },
  },
  { kind: "accepted", message: "Checking result", status: { href: "/status", label: "Status" } },
  confirmed,
] satisfies FormOutcome<FormValues>[])(
  "opens a native restored $kind response without JavaScript",
  (outcome) => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DisclosureForm state={{ ...initial, outcome }} />);
    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.querySelector("summary")).toHaveTextContent("Propose revised terms");
    if (outcome.kind === "confirmed") expect(container).toHaveTextContent("Revision recorded");
    else expect(container.querySelector('input[name="note"]')).toHaveValue("Retained terms");
  },
);

it("reveals native controls on demand and keeps pending, validation focus and receipt visible", async () => {
  let resolve: ((outcome: FormOutcome<FormValues>) => void) | undefined;
  const action: FormAction<FormValues> = async (state, data) => ({
    ...state,
    responseId: `response-${data.get("note")}`,
    values: { note: String(data.get("note")) },
    outcome: await new Promise<FormOutcome<FormValues>>((done) => {
      resolve = done;
    }),
  });
  const { container } = render(<DisclosureForm action={action} />);
  const details = container.querySelector("details");
  expect(details?.open).toBe(false);
  expect(screen.getByRole("textbox", { hidden: true })).not.toBeVisible();
  await userEvent.click(screen.getByText("Propose revised terms"));
  expect(screen.getByRole("textbox")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Submit counteroffer" }));
  expect(details?.open).toBe(true);
  expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
  details?.removeAttribute("open");
  resolve?.(validation);
  const errorLink = await screen.findByRole("link", { name: "Reason: Give a reason" });
  expect(errorLink).toBeVisible();
  expect(details?.open).toBe(true);
  await waitFor(() => expect(document.activeElement?.textContent).toContain("Give a reason"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Reviewed reason" } });
  await userEvent.click(screen.getByRole("button", { name: "Submit counteroffer" }));
  resolve?.(confirmed);
  expect(await screen.findByText("Revision recorded")).toBeVisible();
  expect(details?.open).toBe(true);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
