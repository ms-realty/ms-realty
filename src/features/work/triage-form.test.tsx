import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TriageForm } from "./forms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
it("requires an explicit disposition and a separate queue-effect confirmation", () => {
  render(
    <TriageForm
      locale="en"
      id="test"
      draftOwner={{ id: "synthetic-owner", expiresAt: Date.now() + 60000 }}
      states={["suspected_spam", "duplicate_candidate", "resolved_without_case"]}
      initialState={{
        operationId: "synthetic-operation",
        responseId: "synthetic-response",
        expectedRevision: 1,
        outcome: { kind: "idle" },
        values: { state: "", reason: "", duplicateOfInquiryId: "" },
      }}
      action={async (state) => state}
      duplicateCandidates={[
        { id: "inquiry-id", reference: "INQ-001", preferredName: "Synthetic client" },
      ]}
    />,
  );
  expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Suspected spam" }));
  expect(
    screen.getByRole("checkbox", { name: "I confirm moving this inquiry to review" }),
  ).toBeRequired();
  expect(screen.getByRole("button", { name: "Record: Suspected spam" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Possible duplicate" }));
  const picker = screen.getByRole("combobox", { name: "Original inquiry" });
  expect(picker).toBeRequired();
  fireEvent.change(picker, { target: { value: "INQ-001" } });
  expect(picker).toHaveValue("INQ-001");
});

it("associates a rejected original inquiry with its hint and field error", () => {
  render(
    <TriageForm
      locale="en"
      id="invalid-reference"
      draftOwner={{ id: "synthetic-owner", expiresAt: Date.now() + 60000 }}
      states={["duplicate_candidate"]}
      initialState={{
        operationId: "synthetic-operation",
        responseId: "synthetic-invalid-response",
        expectedRevision: 1,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: "Check the original inquiry.",
          fieldErrors: { duplicateOfInquiryId: ["Choose an inquiry you can access."] },
        },
        values: {
          state: "duplicate_candidate",
          reason: "Review this possible duplicate",
          duplicateOfInquiryId: "INQ-UNKNOWN",
        },
      }}
      action={async (state) => state}
    />,
  );
  const picker = screen.getByRole("combobox", { name: "Original inquiry" });
  expect(picker).toHaveAttribute("aria-invalid", "true");
  expect(picker).toHaveAccessibleDescription(/Choose an inquiry you can access\./);
  expect(picker).toHaveAccessibleDescription(/reference/i);
});
