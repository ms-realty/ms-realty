// Focused state card (O12SAVED, O13ORDER, O13ORDERSAVED, O16AQ/PUB/DONE): one outcome, one way
// back. It stands alone on its canvas with the authentic logo in the card; the workspace chrome
// hides itself while one is shown (data-focused-state, see WorkspaceShell). Geometry follows the
// frames: 20/20 on mobile (42:4304, 642:12748), 64 from the top and an 880 px card with 40 px
// padding from sm (42:4285, 642:12654).
import Image from "next/image";
import type { ReactNode } from "react";
import { CloseIcon, DocumentIcon } from "@/ui/icons";

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
    <div
      data-focused-state
      className="flex min-h-dvh items-start justify-center bg-subtle p-5 sm:p-16"
    >
      <div className="relative w-full max-w-[55rem] space-y-6 rounded-card bg-canvas p-5 sm:p-10">
        <Image
          src="/brand/logo-ms-realty.png"
          alt="MS Realty"
          width={86}
          height={44}
          className="h-auto shrink-0 object-contain"
        />
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

/** The labelled rows of a focused state (O13ORDER, O16PUB, O16AQ). */
export function FocusedRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-divider border-b border-divider">
      {rows.map(([term, detail]) => (
        <div key={term} className="flex items-start gap-3 p-3 text-dense">
          <DocumentIcon className="size-5" />
          <div className="grid gap-1">
            <dt className="font-semibold">{term}</dt>
            <dd className="text-text-muted">{detail}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
