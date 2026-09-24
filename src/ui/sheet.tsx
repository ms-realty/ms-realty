"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { cx } from "./cx";
import { closeButtonClass, overlayClass } from "./dialog";
import { CloseIcon } from "./icons";

const historyKey = "msrSheet";
let sheetCount = 0;

export type SheetState = {
  isOpen: boolean;
  open: () => void;
  /** Closes the sheet; if it added a history entry, that entry is removed with Back. */
  close: () => void;
};

/**
 * Open state for a route-like sheet (spec §17.2): opening adds a history entry, so browser
 * Back closes the sheet instead of leaving the page, and closing it any other way removes
 * that entry again. Nothing is submitted on Back.
 */
export function useSheet(): SheetState {
  const [isOpen, setOpen] = useState(false);
  const token = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPopState = () => {
      if (window.history.state?.[historyKey] !== token.current) {
        token.current = null;
        setOpen(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isOpen]);

  const open = useCallback(() => {
    if (token.current) return;
    sheetCount += 1;
    token.current = `${Date.now()}-${sheetCount}`;
    // Spreading keeps the router's own state on the entry.
    window.history.pushState({ ...window.history.state, [historyKey]: token.current }, "");
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (token.current && window.history.state?.[historyKey] === token.current) {
      window.history.back();
      return;
    }
    token.current = null;
    setOpen(false);
  }, []);

  return { isOpen, open, close };
}

export type SheetProps = {
  state: SheetState;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  /** Fixed action region, e.g. Clear and Apply. Stays above the on-screen keyboard/safe area. */
  footer?: ReactNode;
};

/** Full-height on narrow screens; a side panel from the inline end on wider ones. */
export function Sheet({ state, title, closeLabel, children, footer }: SheetProps) {
  return (
    <ModalOverlay
      isOpen={state.isOpen}
      onOpenChange={(isOpen) => (isOpen ? state.open() : state.close())}
      isDismissable
      className={overlayClass}
    >
      <Modal
        className={cx(
          "fixed inset-0 flex h-dvh flex-col bg-surface shadow-overlay",
          "sm:inset-y-0 sm:start-auto sm:end-0 sm:w-[min(28rem,100%)] forced-colors:border-s",
        )}
      >
        <Dialog className="flex h-full min-h-0 flex-col outline-none">
          <div className="flex items-center justify-between gap-4 border-b border-divider px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            <Heading slot="title" className="text-subheading font-semibold">
              {title}
            </Heading>
            <Button aria-label={closeLabel} onPress={state.close} className={closeButtonClass}>
              <CloseIcon />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-divider bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
