import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivacyReviewStatus } from "@/server/privacy/native";
import { ReviewEnvelope } from "./review-envelope";

const id = "10000000-0000-4000-8000-000000000001";
const operationId = "20000000-0000-4000-8000-000000000001";
const savedOperation = "30000000-0000-4000-8000-000000000001";
const storageKey = (session = "current") => `privacy-review:${session}:${id}`;
const saved = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    operationId: savedOperation,
    version: 1,
    values: [
      ["policyReference", "Unsaved policy"],
      ["to", "verifying"],
    ],
    ...extra,
  });
const reconcile = vi.fn<(key: string, version?: number) => Promise<PrivacyReviewStatus>>();
const props = {
  id,
  version: 2,
  operationId,
  sessionKeys: ["current"],
  reconcile,
  restoredLabel: "Restored without confirmation",
  unkeptLabel: "Cannot keep this draft",
  unknownLabel: "Result uncertain; do not submit again",
  savedLabel: "Recorded",
  checkLabel: "Check again",
  currentLabel: "Open current record",
  currentHref: "/en/operations/privacy",
};
function review(overrides: Partial<typeof props> = {}) {
  return (
    <form aria-label="Review" onSubmit={(event) => event.preventDefault()}>
      <ReviewEnvelope {...props} {...overrides}>
        <label>
          Policy
          <input name="policyReference" defaultValue="Current policy" />
        </label>
        <label>
          Next
          <select name="to" defaultValue="received">
            <option value="received">Received</option>
            <option value="verifying">Verifying</option>
          </select>
        </label>
        <label>
          <input type="checkbox" name="confirmed" value="yes" />
          Confirm again
        </label>
        <button type="submit">Record review</button>
      </ReviewEnvelope>
    </form>
  );
}
beforeEach(() => {
  window.sessionStorage.clear();
  reconcile.mockReset();
  reconcile.mockResolvedValue("absent");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("C-11 kept reviews", () => {
  it("restores only editable values after exact absence, pins the server envelope through refresh, and asks for fresh confirmation", async () => {
    window.sessionStorage.setItem(
      storageKey(),
      saved({
        values: [
          ["policyReference", "Unsaved policy"],
          ["confirmed", "yes"],
          ["expectedVersion", "900"],
          ["operationId", savedOperation],
          ["id", "foreign"],
        ],
      }),
    );
    const view = render(review());
    await screen.findByText("Restored without confirmation");
    expect(reconcile).toHaveBeenCalledWith(savedOperation, 1);
    expect(screen.getByLabelText("Policy")).toHaveValue("Unsaved policy");
    expect(screen.getByLabelText("Confirm again")).not.toBeChecked();
    const form = screen.getByRole("form");
    expect(new FormData(form as HTMLFormElement).get("operationId")).toBe(operationId);
    expect(new FormData(form as HTMLFormElement).get("expectedVersion")).toBe("2");
    fireEvent.click(screen.getByLabelText("Confirm again"));
    view.rerender(review({ version: 3, operationId: savedOperation }));
    expect(new FormData(form as HTMLFormElement).get("operationId")).toBe(operationId);
    expect(new FormData(form as HTMLFormElement).get("expectedVersion")).toBe("2");
    expect(
      JSON.parse(window.sessionStorage.getItem(storageKey()) ?? "null").values,
    ).not.toContainEqual(["confirmed", "yes"]);
  });
  it.each(["pending", "unknown"] as const)(
    "fences %s, preserves the original key and rechecks that key before restoring",
    async (status) => {
      const raw = saved();
      window.sessionStorage.setItem(storageKey(), raw);
      reconcile.mockResolvedValueOnce(status).mockResolvedValueOnce("failed");
      render(review());
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled(),
      );
      expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
      expect(fireEvent.submit(screen.getByRole("form"))).toBe(false);
      expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
      await screen.findByText("Restored without confirmation");
      expect(reconcile.mock.calls).toEqual([
        [savedOperation, 1],
        [savedOperation, 1],
      ]);
      expect(screen.getByRole("button", { name: "Record review" })).toBeEnabled();
      expect(screen.getByLabelText("Confirm again")).not.toBeChecked();
    },
  );
  it("checks all verified predecessor drafts before replacing any, and migrates only after safe reconciliation", async () => {
    window.sessionStorage.setItem(storageKey("previous"), saved());
    const unrelated = storageKey("another-sign-in");
    window.sessionStorage.setItem(
      unrelated,
      saved({ values: [["policyReference", "Do not inherit"]] }),
    );
    render(review({ sessionKeys: ["current", "previous"] }));
    await screen.findByText("Restored without confirmation");
    expect(screen.getByLabelText("Policy")).toHaveValue("Unsaved policy");
    expect(window.sessionStorage.getItem(storageKey("previous"))).toBeNull();
    expect(window.sessionStorage.getItem(storageKey())).toContain(operationId);
    expect(window.sessionStorage.getItem(unrelated)).toContain("Do not inherit");
  });
  it("never hides an uncertain predecessor behind a newer unsent draft", async () => {
    window.sessionStorage.setItem(storageKey(), saved({ operationId }));
    window.sessionStorage.setItem(storageKey("previous"), saved());
    reconcile.mockResolvedValueOnce("absent").mockResolvedValueOnce("unknown");
    render(review({ sessionKeys: ["current", "previous"] }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey("previous"))).not.toBeNull();
  });
  it("clears only the matching recorded draft and does not offer a second write", async () => {
    window.sessionStorage.setItem(storageKey(), saved());
    reconcile.mockResolvedValue("succeeded");
    render(review());
    await screen.findByText("Recorded");
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
    expect(screen.queryByText("Restored without confirmation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
  });
  it("does not clear a draft replaced in storage while its older key is being checked", async () => {
    let finish!: (status: PrivacyReviewStatus) => void;
    reconcile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    window.sessionStorage.setItem(storageKey(), saved());
    render(review());
    const changed = saved({ operationId });
    window.sessionStorage.setItem(storageKey(), changed);
    await act(async () => finish("succeeded"));
    expect(window.sessionStorage.getItem(storageKey())).toBe(changed);
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
    expect(screen.getByText("Result uncertain; do not submit again")).toBeVisible();
  });
  it("keeps a failed reconciliation request fenced without changing the saved key", async () => {
    const raw = saved();
    window.sessionStorage.setItem(storageKey(), raw);
    reconcile.mockRejectedValue(new Error("Answer dropped"));
    render(review());
    await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
    expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
  });
  it.each(["not json", "null", '{"operationId":"forged","values":[]}', saved({ values: null })])(
    "treats malformed storage as uncertain without replacing it: %s",
    async (raw) => {
      window.sessionStorage.setItem(storageKey(), raw);
      render(review());
      await screen.findByText("Result uncertain; do not submit again");
      expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
      expect(window.sessionStorage.getItem(storageKey())).toBe(raw);
      expect(reconcile).not.toHaveBeenCalled();
    },
  );
  it("keeps blocked storage explicit while retaining the native form path", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(review());
    await screen.findByText("Cannot keep this draft");
    expect(screen.getByRole("button", { name: "Record review" })).toBeEnabled();
  });
  it("does not re-enable a saved form after an old reconciliation resolves on an unmounted render", async () => {
    let finish!: (status: PrivacyReviewStatus) => void;
    reconcile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    window.sessionStorage.setItem(storageKey(), saved());
    const view = render(review());
    view.unmount();
    await act(async () => finish("absent"));
    expect(window.sessionStorage.getItem(storageKey())).toBe(saved());
  });
});
