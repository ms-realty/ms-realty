import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StickyHeader } from "./sticky-header";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("updates the focus offset when the header wraps and releases it when the shell leaves", () => {
  let height = 73;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    top: 0,
    bottom: height,
    left: 0,
    right: 390,
    width: 390,
    height,
    toJSON: () => ({}),
  }));
  let resized = () => {};
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const view = render(
    <StickyHeader>
      <a href="/bg">Home</a>
    </StickyHeader>,
  );
  expect(screen.getByRole("banner")).toHaveAttribute("data-public-header");
  expect(observe).toHaveBeenCalledWith(screen.getByRole("banner"));
  expect(document.documentElement.style.getPropertyValue("--public-header-height")).toBe("73px");
  height = 145;
  resized();
  expect(document.documentElement.style.getPropertyValue("--public-header-height")).toBe("145px");
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(document.documentElement.style.getPropertyValue("--public-header-height")).toBe("");
});
