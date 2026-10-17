import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivatePageGuard } from "./private-page-guard";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});
describe("AT39 private page restoration", () => {
  it("conceals stale private content until refresh completes and preserves an unsaved input", async () => {
    let finish: () => void = () => {};
    refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const page = (verification: string) => (
      <PrivatePageGuard locale="en" verification={verification}>
        <h1>Private case</h1>
        <label>
          Draft
          <input defaultValue="" />
        </label>
      </PrivatePageGuard>
    );
    const { rerender } = render(page("initial"));
    const draft = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(draft, { target: { value: "Unsaved note" } });
    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("Private case")).not.toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Checking access…");
    expect(screen.getByText("Private case")).not.toBeVisible();
    await act(async () => {
      rerender(page("authorized-response"));
      finish();
    });
    expect(screen.getByText("Private case")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
    expect(draft).toHaveValue("Unsaved note");
  });
  it("a back-forward cache restoration also reauthorizes before showing private content", async () => {
    let finish: () => void = () => {};
    refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const page = (verification: string) => (
      <PrivatePageGuard locale="en" verification={verification}>
        <h1>Protected work</h1>
      </PrivatePageGuard>
    );
    const { rerender } = render(page("initial"));
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Protected work")).not.toBeVisible();
    await act(async () => {
      rerender(page("authorized-response"));
      finish();
    });
    expect(screen.getByText("Protected work")).toBeVisible();
  });
  it("keeps private content concealed when a refresh ends without a fresh server render", async () => {
    refresh.mockResolvedValue(undefined);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const page = (verification: string) => (
      <PrivatePageGuard locale="en" verification={verification}>
        <h1>Protected work</h1>
      </PrivatePageGuard>
    );
    const { rerender } = render(page("initial"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("Protected work")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Check access again" })).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check access again" }));
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Protected work")).not.toBeVisible();
    rerender(page("authorized-response"));
    expect(screen.getByText("Protected work")).toBeVisible();
  });
});
