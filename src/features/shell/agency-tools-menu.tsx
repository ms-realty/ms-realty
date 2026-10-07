"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

function menuDialog(id: string): HTMLDialogElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLDialogElement ? element : null;
}

/**
 * The phone context bar's menu control (Figma «Go / X02 / Open menu»). It is a link to the X02
 * page, so it works before and without JavaScript. With JavaScript, X02 opens in place as a
 * modal dialog: focus moves into it and the page behind is inert; Escape or Close returns focus
 * here; choosing a destination, or any route change, closes it.
 */
export function AgencyToolsMenu({
  href,
  dialogId,
  className,
  children,
}: {
  href: string;
  dialogId: string;
  className?: string;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    setEnhanced(true);
    const dialog = menuDialog(dialogId);
    if (!dialog) return;
    const returnFocus = () => trigger.current?.focus();
    const closeOnChoice = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) dialog.close();
    };
    dialog.addEventListener("close", returnFocus);
    dialog.addEventListener("click", closeOnChoice);
    return () => {
      dialog.removeEventListener("close", returnFocus);
      dialog.removeEventListener("click", closeOnChoice);
    };
  }, [dialogId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: closes whenever the route changes.
  useEffect(() => {
    const dialog = menuDialog(dialogId);
    if (dialog?.open) dialog.close();
  }, [pathname, dialogId]);

  return (
    <a
      ref={trigger}
      href={href}
      aria-haspopup={enhanced ? "dialog" : undefined}
      aria-controls={enhanced ? dialogId : undefined}
      className={className}
      onClick={(event) => {
        const dialog = menuDialog(dialogId);
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (!dialog || event.button !== 0 || modified) return;
        event.preventDefault();
        dialog.showModal();
      }}
    >
      {children}
    </a>
  );
}
