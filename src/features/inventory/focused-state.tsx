// Focused state card (O12SAVED, O13ORDER, O13ORDERSAVED): one outcome, one way back.
import type { ReactNode } from "react";
import { CloseIcon } from "@/ui/icons";

export function FocusedState({
  closeHref,
  closeLabel,
  children,
}: {
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[80dvh] items-start justify-center bg-subtle px-gutter py-8 sm:py-16">
      <div className="relative w-full max-w-[55rem] space-y-6 rounded-card bg-canvas p-6 sm:p-10">
        <a
          href={closeHref}
          aria-label={closeLabel}
          className="absolute end-4 top-4 inline-flex size-control items-center justify-center rounded-control text-text-muted hover:bg-subtle sm:end-8 sm:top-8"
        >
          <CloseIcon className="size-5" />
        </a>
        {children}
      </div>
    </div>
  );
}
