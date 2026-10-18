import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
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

it("reveals a focused page field that the browser left under the header", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  const tops = new Map<string, number>([
    ["header", 0],
    ["under", 20],
    ["below", 200],
    ["menu", 10],
  ]);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const top = tops.get(this.dataset.probe ?? "") ?? 0;
    const height = this.dataset.probe === "header" ? 73 : 40;
    return {
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: 390,
      width: 390,
      height,
    } as DOMRect;
  });
  // jsdom has no layout, so it implements no scrollIntoView to spy on.
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    configurable: true,
  });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
  render(
    <>
      <StickyHeader>
        <a href="/bg" data-probe="menu">
          Menu
        </a>
      </StickyHeader>
      <main>
        <input aria-label="Under the header" data-probe="under" />
        <input aria-label="Below the header" data-probe="below" />
      </main>
    </>,
  );
  screen.getByRole("banner").dataset.probe = "header";
  screen.getByLabelText("Below the header").focus();
  screen.getByRole("link", { name: "Menu" }).focus();
  expect(scrollIntoView).not.toHaveBeenCalled();
  const under = screen.getByLabelText("Under the header");
  under.focus();
  expect(scrollIntoView).toHaveBeenCalledOnce();
  expect(scrollIntoView.mock.contexts[0]).toBe(under);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
});
