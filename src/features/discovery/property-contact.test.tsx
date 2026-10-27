import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PropertyContactBar } from "./property-contact";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("P05/L03 reserves the measured action height, yields to editing and restores document spacing on exit", async () => {
  let resize: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = this.tagName === "NAV" && this.dataset.keyboard !== "true" ? 88 : 0;
    return {
      height,
      width: 390,
      x: 0,
      y: 756,
      top: 756,
      left: 0,
      right: 390,
      bottom: 756 + height,
      toJSON() {},
    };
  });
  const user = userEvent.setup();
  const view = render(
    <>
      <label>
        Contact note
        <input />
      </label>
      <button type="button">Continue browsing</button>
      <PropertyContactBar reference="MS-SYNTHETIC" label="Property actions">
        <a href="/en/inquire?reference=MS-SYNTHETIC">Ask</a>
      </PropertyContactBar>
    </>,
  );
  const dock = screen.getByRole("navigation", { name: "Property actions" });
  expect(document.documentElement.style.getPropertyValue("--msr-property-dock-height")).toBe(
    "88px",
  );
  await user.click(screen.getByLabelText("Contact note"));
  expect(dock).toHaveAttribute("data-keyboard", "true");
  act(resize);
  expect(document.documentElement.style.getPropertyValue("--msr-property-dock-height")).toBe("0px");
  await user.click(screen.getByRole("button", { name: "Continue browsing" }));
  expect(dock).not.toHaveAttribute("data-keyboard");
  act(resize);
  expect(document.documentElement.style.getPropertyValue("--msr-property-dock-height")).toBe(
    "88px",
  );
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(document.documentElement.style.getPropertyValue("--msr-property-dock-height")).toBe("");
});
