import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it } from "vitest";
import { Dialog } from "./dialog";

afterEach(cleanup);

it("starts a consequential confirmation on its safe close action", async () => {
  render(
    <Dialog title="Withdraw publication?" closeLabel="Keep publication" role="alertdialog" isOpen>
      <button type="button">Withdraw</button>
    </Dialog>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Keep publication" })).toHaveFocus(),
  );
});

it("allows a caller to target the safe cancel action instead of a destructive first content action", async () => {
  function Confirmation() {
    const safe = useRef<HTMLButtonElement>(null);
    return (
      <Dialog
        title="Remove access?"
        closeLabel="Close"
        role="alertdialog"
        initialFocusRef={safe}
        isOpen
      >
        <button type="button">Remove access</button>
        <button type="button" ref={safe}>
          Keep access
        </button>
      </Dialog>
    );
  }
  render(<Confirmation />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Keep access" })).toHaveFocus());
});
