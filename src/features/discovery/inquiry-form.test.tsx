import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

afterEach(cleanup);
describe("P11 inquiry draft", () => {
  it("retains separate contact drafts, selected method and consent after server validation", async () => {
    const user = userEvent.setup();
    const state: InquiryState = {
      operationId: "server-key",
      expectedRevision: null,
      responseId: "initial",
      values: emptyInquiry,
      outcome: { kind: "idle" },
    };
    render(
      <InquiryForm
        locale="en"
        copy={discoveryCopy("en")}
        initialState={state}
        action={async (previous, data) => ({
          ...previous,
          responseId: "checked",
          values: Object.fromEntries(
            Object.keys(emptyInquiry).map((key) => [key, String(data.get(key) ?? "")]),
          ) as typeof emptyInquiry,
          outcome: {
            kind: "validation",
            code: "VALIDATION_FAILED",
            message: "Check",
            fieldErrors: { message: ["Add a question"] },
          },
        })}
      />,
    );
    await user.type(screen.getByLabelText("Email", { exact: true }), "visitor@example.test");
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "phone");
    await user.type(
      screen.getByLabelText("Phone with country code", { exact: true }),
      "+359881234567",
    );
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "email");
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("visitor@example.test");
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "phone");
    expect(screen.getByLabelText("Phone with country code", { exact: true })).toHaveValue(
      "+359881234567",
    );
    const consent = screen.getByRole("checkbox");
    await user.click(consent);
    await user.click(screen.getByRole("button", { name: "Send an inquiry" }));
    await screen.findByRole("link", { name: "Your inquiry: Add a question" });
    expect(screen.getByLabelText("Preferred contact method")).toHaveValue("phone");
    expect(screen.getByLabelText("Phone with country code", { exact: true })).toHaveValue(
      "+359881234567",
    );
    expect(consent).toBeChecked();
  });
});
