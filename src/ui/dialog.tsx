"use client";

import type { ReactNode } from "react";
import { Button, Heading, Modal, ModalOverlay, Dialog as RACDialog } from "react-aria-components";
import { cx } from "./cx";
import { CloseIcon } from "./icons";

export { DialogTrigger } from "react-aria-components";

export const overlayClass = "fixed inset-0 z-(--z-overlay) bg-overlay";

export const closeButtonClass = cx(
  "flex size-control shrink-0 cursor-pointer items-center justify-center rounded-control text-text-muted",
  "data-hovered:bg-subtle data-hovered:text-text data-pressed:bg-selected",
);

export type DialogProps = {
  title: ReactNode;
  /** Accessible name of the close button, e.g. "Close". */
  closeLabel: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** "alertdialog" for consequential confirmations: no outside-click dismissal. */
  role?: "dialog" | "alertdialog";
  /** Controlled use; inside a DialogTrigger these come from the trigger. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

/** Modal dialog: focus moves in, stays in, and returns to the trigger on close. */
export function Dialog({ title, closeLabel, children, role = "dialog", ...state }: DialogProps) {
  return (
    <ModalOverlay
      {...state}
      isDismissable={role === "dialog"}
      className={cx(overlayClass, "flex items-center justify-center p-4")}
    >
      <Modal className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-overlay forced-colors:border">
        <RACDialog role={role} className="flex min-h-0 flex-col outline-none">
          {({ close }) => (
            <>
              <div className="flex items-start justify-between gap-4 px-6 pt-5">
                <Heading slot="title" className="pt-2 text-heading font-semibold">
                  {title}
                </Heading>
                <Button aria-label={closeLabel} onPress={close} className={closeButtonClass}>
                  <CloseIcon />
                </Button>
              </div>
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-2 pb-6">
                {typeof children === "function" ? children(close) : children}
              </div>
            </>
          )}
        </RACDialog>
      </Modal>
    </ModalOverlay>
  );
}
