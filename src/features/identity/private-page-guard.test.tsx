import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivatePageGuard } from "./private-page-guard";

const refresh = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./private-access-action", () => ({ privateAccessState: access }));
vi.mock("./reload", () => ({ reloadPage: reload }));

let now = 1_000_000;
let visibility: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(Date, "now").mockImplementation(() => now);
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
  access.mockReset();
  reload.mockReset();
});

const minute = 60_000;
/** Hide the tab, let `away` pass, show it again. */
async function leaveFor(away: number) {
  visibility.mockReturnValue("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  now += away;
  visibility.mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
const page = (verification = "initial") => (
  <PrivatePageGuard locale="en" recheckAfterMs={15 * minute} verification={verification}>
    <h1>Private case</h1>
    <label>
      Draft
      <input defaultValue="" />
    </label>
  </PrivatePageGuard>
);

describe("AT39 private page restoration", () => {
  it("keeps the page through a short absence and rechecks the session in the background", async () => {
    access.mockResolvedValue("active");
    render(page());
    const draft = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(draft, { target: { value: "Unsaved note" } });
    await leaveFor(2 * minute);
    expect(access).toHaveBeenCalledOnce();
    expect(screen.getByText("Private case")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(draft).toHaveValue("Unsaved note");
    expect(reload).not.toHaveBeenCalled();
  });

  it("conceals after a short absence only when the session is gone, and goes to sign-in", async () => {
    access.mockResolvedValue("signed_out");
    render(page());
    await leaveFor(2 * minute);
    expect(screen.getByText("Private case")).not.toBeVisible();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps the page through a short absence when the check itself fails", async () => {
    access.mockRejectedValue(new Error("offline"));
    render(page());
    await leaveFor(2 * minute);
    expect(screen.getByText("Private case")).toBeVisible();
    expect(reload).not.toHaveBeenCalled();
  });

  it("conceals a long absence until a fresh authorized render, keeping the draft", async () => {
    const { rerender } = render(page());
    const draft = screen.getByRole("textbox", { name: "Draft" });
    draft.focus();
    fireEvent.change(draft, { target: { value: "Unsaved note" } });
    await leaveFor(16 * minute);
    expect(screen.getByRole("status")).toHaveTextContent("Checking access…");
    expect(screen.getByText("Private case")).not.toBeVisible();
    expect(refresh).toHaveBeenCalledOnce();
    expect(access).not.toHaveBeenCalled();
    rerender(page("fresh-authorized-view"));
    expect(screen.getByText("Private case")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
    expect(draft).toHaveValue("Unsaved note");
    expect(draft).toHaveFocus();
  });

  it("a back-forward cache restoration also reauthorizes before showing private content", async () => {
    const { rerender } = render(page());
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    await act(async () => {
      window.dispatchEvent(restored);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Private case")).not.toBeVisible();
    rerender(page("fresh-authorized-view"));
    expect(screen.getByText("Private case")).toBeVisible();
  });

  it("keeps the stale view concealed when the refresh yields no proof and retries by reloading", async () => {
    render(page());
    await leaveFor(16 * minute);
    expect(screen.getByText("Private case")).not.toBeVisible();
    const retry = screen.getByRole("button", { name: "Check access again" });
    fireEvent.click(retry);
    expect(reload).toHaveBeenCalledOnce();
  });
});

it("ignores duplicate visible notifications that did not follow a hidden page", () => {
  render(page());
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(access).not.toHaveBeenCalled();
  expect(screen.getByText("Private case")).toBeVisible();
});
