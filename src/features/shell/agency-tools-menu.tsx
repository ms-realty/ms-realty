"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

function menuDialog(id: string): HTMLDialogElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLDialogElement ? element : null;
}

/** Native link first; an enhanced opener restores only its own focus after closing. */
export function AgencyToolsMenu({
  href,
  dialogId,
  className,
  shortcut = false,
  children,
}: {
  href: string;
  dialogId: string;
  className?: string;
  shortcut?: boolean;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLAnchorElement>(null);
  const openedHere = useRef(false);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
    const dialog = menuDialog(dialogId);
    if (!dialog) return;
    const returnFocus = () => {
      if (openedHere.current) trigger.current?.focus();
      openedHere.current = false;
    };
    dialog.addEventListener("close", returnFocus);
    return () => dialog.removeEventListener("close", returnFocus);
  }, [dialogId]);
  return (
    <a
      ref={trigger}
      href={href}
      aria-haspopup={enhanced ? "dialog" : undefined}
      aria-controls={enhanced ? dialogId : undefined}
      aria-keyshortcuts={enhanced && shortcut ? "Control+k Meta+k" : undefined}
      className={className}
      onClick={(event) => {
        const dialog = menuDialog(dialogId);
        if (
          !dialog ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        openedHere.current = true;
        dialog.showModal();
        dialog.querySelector<HTMLInputElement>("[data-page-filter]")?.focus();
      }}
    >
      {children}
    </a>
  );
}

/** Mounted once, independently of desktop/mobile openers and an optional record-search slot. */
export function AgencyToolsBehavior({ dialogId }: { dialogId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const dialog = menuDialog(dialogId);
    if (!dialog) return;
    let shortcutOrigin: HTMLElement | null = null;
    const returnFocus = () => {
      shortcutOrigin?.focus();
      shortcutOrigin = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (
        event.key === "Tab" &&
        dialog.open &&
        event.target instanceof Node &&
        dialog.contains(event.target)
      ) {
        const stops = [
          ...dialog.querySelectorAll<HTMLElement>(
            "a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]",
          ),
        ].filter((element) => {
          if (
            element.tabIndex < 0 ||
            element.matches(":disabled") ||
            element.closest("[hidden],[inert]") ||
            !element.getClientRects().length ||
            getComputedStyle(element).visibility === "hidden"
          )
            return false;
          // Native closed details can retain descendant rectangles. Only their summary is a stop.
          for (
            let parent: Element | null = element.parentElement;
            parent && parent !== dialog;
            parent = parent.parentElement
          ) {
            if (
              parent instanceof HTMLDetailsElement &&
              !parent.open &&
              !parent.querySelector(":scope > summary")?.contains(element)
            )
              return false;
          }
          return true;
        });
        const first = stops[0],
          last = stops.at(-1);
        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
        return;
      }
      if (event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]",
        )
      )
        return;
      if (dialog.open || document.querySelector("dialog:modal")) return;
      event.preventDefault();
      shortcutOrigin =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("[data-page-filter]")?.focus();
    };
    const closeOnChoice = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (event.target instanceof Element && event.target.closest("a[href]")) dialog.close();
      if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          dialog.close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    dialog.addEventListener("click", closeOnChoice);
    dialog.addEventListener("close", returnFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("click", closeOnChoice);
      dialog.removeEventListener("close", returnFocus);
    };
  }, [dialogId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes whenever the route changes.
  useEffect(() => {
    const dialog = menuDialog(dialogId);
    if (dialog?.open) dialog.close();
  }, [pathname, dialogId]);
  return null;
}
