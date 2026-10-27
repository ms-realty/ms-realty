import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CorrectionForm } from "./correction-form";

afterEach(cleanup);
it("O33 has no default reconciliation decision and cannot offer verification before owner evidence", () => {
  render(
    <CorrectionForm
      locale="en"
      reference="MS-90000"
      mode="reconcile"
      items={[
        {
          key: "owner:synthetic",
          kind: "owner",
          recordId: "synthetic",
          reference: "CASE-SYNTHETIC",
          caseId: "synthetic",
          state: "review_required",
          revision: "synthetic-revision",
          ready: false,
        },
      ]}
      initialState={{
        operationId: "synthetic-operation",
        expectedRevision: 1,
        responseId: "initial",
        values: {
          impactHash: "synthetic-hash",
          reviewed: "",
          followUpAt: "",
          state_0: "",
          evidence_0: "",
        },
        outcome: { kind: "idle" },
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(
    screen.queryByRole("option", { name: "Verified correction or removal" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: "Unresolved — keep responsibility with me" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Owner or source verification is still required/)).toBeVisible();
});
