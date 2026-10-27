// O24/F30: native directory reads keep the existing draft and unknown-result fence mounted.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyOperatingPolicy } from "@/domain/operating-policy";
import { policyToValues } from "@/domain/operating-policy-form";
import { formFields } from "@/ui/form/contract";
import { workCopy } from "../work/copy";
import { operatingPolicyCopy } from "./copy";
import { PolicyDraftForm } from "./forms";
import type { PolicyDraftState } from "./owner-directory-state";

const copy = operatingPolicyCopy("en");
const owner = { id: "10000000-0000-4000-8000-000000000001", displayName: "Synthetic late owner" };
const path = "/en/settings/operating-policy";
function state(): PolicyDraftState {
  return {
    operationId: "synthetic-original-save-key",
    expectedRevision: 7,
    responseId: "synthetic-response",
    values: {
      ...policyToValues(emptyOperatingPolicy),
      ownerSearch: "Synthetic",
      ownerService: owner.id,
      coverage: "Synthetic original source and coverage",
    },
    outcome: { kind: "idle" },
  };
}
function form(initialState = state()) {
  return render(
    <PolicyDraftForm
      locale="en"
      copy={copy}
      formCopy={workCopy("en").form}
      action={vi.fn()}
      initialState={initialState}
      owners={[owner]}
      ownerDirectory={{ rows: [], search: "", page: 1, hasMore: true }}
    />,
  );
}
afterEach(cleanup);
it("submits native paging in the existing form body, with all draft fields and no command intent", () => {
  const { container } = form();
  const button = screen.getByRole("button", { name: copy.ownerNext, hidden: true });
  const element = button.closest("form");
  if (!element) throw new Error("Missing native draft form");
  const data = new FormData(element, button as HTMLButtonElement);
  expect(data.get("_ownerPage")).toBe("2");
  expect(data.get(formFields.intent)).toBeNull();
  expect(data.get(formFields.operationId)).toBe("synthetic-original-save-key");
  expect(data.get(formFields.expectedRevision)).toBe("7");
  expect(data.get("coverage")).toBe(state().values.coverage);
  expect(data.get("ownerService")).toBe(owner.id);
  expect(data.get("ownerSearch")).toBe("Synthetic");
  expect(container.querySelectorAll("form")).toHaveLength(1);
  for (const link of container.querySelectorAll("a")) expect(link.href).not.toContain("Synthetic");
});
it("restores a late selected owner and unchanged source/key after an empty native directory result", () => {
  const restored: PolicyDraftState = {
    ...state(),
    ownerChoices: [owner],
    ownerDirectory: { rows: [], search: "Synthetic", page: 4, hasMore: false },
  };
  const { container } = form(restored);
  expect(screen.getByLabelText(copy.fields.ownerService)).toHaveValue(owner.id);
  expect(
    within(screen.getByLabelText(copy.fields.ownerService)).getByRole("option", {
      name: owner.displayName,
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(copy.fields.coverage)).toHaveValue(restored.values.coverage);
  expect(screen.getByLabelText(copy.ownerSearch)).toHaveValue("Synthetic");
  expect(container.querySelector('input[name="_ownerCurrentPage"]')).toHaveValue("4");
  expect(container.querySelector(`input[name="${formFields.operationId}"]`)).toHaveValue(
    restored.operationId,
  );
  expect(container.querySelector(`input[name="${formFields.expectedRevision}"]`)).toHaveValue("7");
  expect(screen.getByLabelText(copy.ownerSearch).closest("details")).toHaveAttribute("open");
});
it("keeps the unknown command fenced while preserving the directory, exact selection and manual readback", () => {
  const restored: PolicyDraftState = {
    ...state(),
    ownerChoices: [owner],
    ownerDirectory: { rows: [], search: "Synthetic", page: 4, hasMore: true },
    outcome: {
      kind: "unknown",
      code: "OUTCOME_UNKNOWN",
      message: copy.pending,
      status: { href: `${path}/operations/save/synthetic-original-save-key`, label: copy.check },
    },
  };
  form(restored);
  expect(screen.getByRole("button", { name: copy.ownerSearchSubmit })).toBeDisabled();
  expect(screen.getByRole("button", { name: copy.ownerNext })).toBeDisabled();
  expect(screen.getByLabelText(copy.fields.ownerService)).toBeDisabled();
  expect(screen.getByLabelText(copy.fields.coverage)).toHaveValue(restored.values.coverage);
  expect(screen.getByRole("link", { name: copy.check })).toHaveAttribute(
    "href",
    `${path}/operations/save/synthetic-original-save-key`,
  );
  expect(screen.queryByRole("button", { name: copy.save })).not.toBeInTheDocument();
});
