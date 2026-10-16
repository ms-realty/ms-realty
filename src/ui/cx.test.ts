import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buttonClass } from "./button-class";
import { cx } from "./cx";

describe("M-049 semantic Tailwind overrides", () => {
  it.each([
    [
      "local selection",
      "max-w-full px-1 text-caption wrap-anywhere",
      ["px-1", "text-caption"],
      ["px-5", "text-compact"],
    ],
    ["saved properties", "max-w-full px-1", ["px-1"], ["px-5"]],
    ["shared link", "self-start px-1", ["px-1"], ["px-5"]],
    ["receipt listings", "px-0", ["px-0"], ["px-5"]],
    ["inquiry search", "px-3 min-h-12", ["px-3", "min-h-12"], ["px-5", "min-h-control"]],
    [
      "Butler draft",
      "self-start bg-assist-soft text-assist",
      ["bg-assist-soft", "text-assist"],
      ["bg-transparent", "text-action"],
    ],
  ] as const)(
    "honours %s without relying on stylesheet order",
    (_name, override, kept, removed) => {
      const classes = buttonClass("tertiary", override).split(" ");
      for (const name of kept) expect(classes).toContain(name);
      for (const name of removed) expect(classes).not.toContain(name);
    },
  );

  it("keeps font-size and foreground independent and recognises every generated text role", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    const roles = [...css.matchAll(/--text-([a-z]+):/g)].map((match) => match[1]);
    expect(roles.length).toBeGreaterThan(5);
    for (const role of roles) {
      expect(cx("text-text-muted text-body", `text-${role}`)).toBe(`text-text-muted text-${role}`);
      expect(cx(`text-${role} text-text-muted`, "text-action")).toBe(`text-${role} text-action`);
    }
  });

  it("preserves responsive and state-specific declarations while replacing their own conflicts", () => {
    expect(cx("px-5 sm:px-4 hover:bg-action", "px-1 sm:px-3 hover:bg-assist-soft")).toBe(
      "px-1 sm:px-3 hover:bg-assist-soft",
    );
    expect(cx("px-5", false, null, undefined, "px-0")).toBe("px-0");
    expect(
      cx("max-w-form rounded-panel shadow-raised", "max-w-page rounded-card shadow-overlay"),
    ).toBe("max-w-page rounded-card shadow-overlay");
  });
});
