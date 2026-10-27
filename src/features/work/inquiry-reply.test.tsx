import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InquiryReply } from "./inquiry-reply";

afterEach(cleanup);
it("O03 requires current human review and never overwrites a typed reply with a Butler draft", () => {
  render(
    <InquiryReply
      locale="en"
      reference="RQ-SYNTHETIC"
      contact={{ kind: "email", value: "synthetic@example.test", verification: "unverified" }}
      draft={{
        id: "synthetic-run",
        body: "Source-bound reviewed draft",
        sourceVersion: 3,
        reviewedAt: "synthetic-review",
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Open email draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use this reviewed Butler draft" }));
  const field = screen.getByRole("textbox", { name: "Reply draft" });
  expect(field).toHaveValue("Source-bound reviewed draft");
  expect(screen.getByRole("button", { name: "Use this reviewed Butler draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("link", { name: "Open email draft" })).toHaveAttribute(
    "href",
    expect.stringContaining("mailto:synthetic%40example.test?"),
  );
  fireEvent.change(field, { target: { value: "Human correction" } });
  expect(screen.queryByRole("link", { name: "Open email draft" })).not.toBeInTheDocument();
  expect(screen.getByText(/Nothing is sent by this workspace/)).toBeVisible();
});
