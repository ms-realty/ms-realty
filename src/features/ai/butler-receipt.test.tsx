import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { butlerReceipt } from "@/domain/butler";
import { ButlerReceiptLine, DraftRunReceipt } from "./butler-receipt";

afterEach(cleanup);
it.each(["awaiting_approval", "blocked"] as const)(
  "O32 shows the persisted %s receipt with a manual path and no execution claim",
  (verdict) => {
    render(
      <ButlerReceiptLine
        locale="en"
        receipt={butlerReceipt(
          "synthetic-operation",
          "task.create",
          verdict,
          "draft_only",
          "not_applied",
        )}
        manualHref="/en/cases/synthetic#case-next"
      />,
    );
    expect(screen.getByRole("link", { name: "Do it myself" })).toHaveAttribute(
      "href",
      "/en/cases/synthetic#case-next",
    );
    expect(screen.getAllByText(/Nothing is sent or published by Butler/).length).toBeGreaterThan(0);
  },
);
it("O32 reports current source/review state and unknown outcomes without inferring success", () => {
  render(
    <>
      <DraftRunReceipt
        locale="en"
        state="stale"
        sourceCurrent={false}
        reviewedAt={null}
        manualHref="/en/inquiries/synthetic"
      />
      <ButlerReceiptLine
        locale="en"
        receipt={butlerReceipt(
          "synthetic-operation",
          "task.create",
          "blocked",
          "source_changed",
          "unknown",
        )}
        manualHref="/en/cases/synthetic#case-timeline"
      />
    </>,
  );
  expect(screen.getByText("Human review required")).toBeVisible();
  expect(screen.getByText(/The source changed/)).toBeVisible();
  expect(screen.getByText(/Outcome not confirmed/)).toBeVisible();
  expect(
    screen.getByText("Check the existing request before taking another action."),
  ).toBeVisible();
});
