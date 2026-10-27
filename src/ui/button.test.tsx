import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

it("keeps associated form, ARIA and data attributes while an unavailable action stays focusable", async () => {
  const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
  const press = vi.fn();
  const start = vi.fn();
  render(
    <>
      <form id="decision" onSubmit={submit} />
      <p id="source">Review source revision first.</p>
      <Button
        type="submit"
        form="decision"
        name="decision"
        value="approve"
        data-source-revision="42"
        aria-describedby="source"
        aria-controls="review"
        disabledReason="A current review is required."
        onPress={press}
        onPressStart={start}
      >
        Approve publication
      </Button>
    </>,
  );
  const button = screen.getByRole("button", { name: "Approve publication" });
  expect(button).toHaveAttribute("form", "decision");
  expect(button).toHaveAttribute("name", "decision");
  expect(button).toHaveAttribute("value", "approve");
  expect(button).toHaveAttribute("data-source-revision", "42");
  expect(button).toHaveAttribute("aria-controls", "review");
  expect(button).toHaveAccessibleDescription(
    "Review source revision first. A current review is required.",
  );
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).not.toBeDisabled();
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
  expect(press).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(document.querySelector('[data-announcer="polite"]')).toHaveTextContent(
      "A current review is required.",
    );
  });
});

it("retains pending state and its accessible label on the unavailable branch", () => {
  render(
    <Button disabledReason="Check the original operation." isPending pendingLabel="Checking…">
      Confirm
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Checking…" });
  expect(button).toHaveAttribute("data-pending", "true");
  expect(button).toHaveAttribute("aria-disabled", "true");
});
