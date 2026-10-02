"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const selector = "details[data-dismissible]";

function openDisclosures(): HTMLDetailsElement[] {
  return [...document.querySelectorAll<HTMLDetailsElement>(`${selector}[open]`)];
}

/**
 * Progressive enhancement for the shells' native disclosures (menu, language, More). Without
 * JavaScript they open and close with their summary. With it, one is open at a time, Escape
 * closes it and returns focus to its summary, and an outside click or a navigation closes it.
 * Rendered once per shell; it has no markup of its own.
 */
export function DisclosureBehavior() {
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: closes whenever the route changes.
  useEffect(() => {
    for (const details of openDisclosures()) details.open = false;
  }, [pathname]);

  useEffect(() => {
    function onToggle(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.matches(selector) || !target.open) {
        return;
      }
      for (const details of openDisclosures()) if (details !== target) details.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const open = openDisclosures();
      const details =
        open.find((element) => element.contains(document.activeElement)) ?? open.at(-1);
      if (!details) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      for (const details of openDisclosures()) {
        if (!details.contains(event.target as Node)) details.open = false;
      }
    }
    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return null;
}
