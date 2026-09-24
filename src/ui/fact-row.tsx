import type { ReactNode } from "react";
import { cx } from "./cx";
import { HistoryIcon } from "./icons";

/** A description list of facts; each FactRow is one term and its value. */
export function FactList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("flex flex-col divide-y divide-divider", className)}>{children}</dl>;
}

export type FactRowProps = {
  label: string;
  /** Formatted value in the page locale. Omit when the fact is unknown: never guess or blank it. */
  value?: string;
  unit?: string;
  /** What the value measures, e.g. "Built area, including common parts". */
  basis?: string;
  /** Where the value comes from and when, e.g. "From the title deed, checked 12 Aug 2026". */
  provenance?: string;
  /** Shown instead of the value when unknown, e.g. "Not yet confirmed". */
  unknownLabel: string;
  /** Next to an unknown value: the way to ask, e.g. a link "Ask us to confirm". */
  confirmAction?: ReactNode;
};

export function FactRow({
  label,
  value,
  unit,
  basis,
  provenance,
  unknownLabel,
  confirmAction,
}: FactRowProps) {
  const isKnown = value !== undefined && value !== "";
  return (
    <div
      data-known={isKnown}
      className="grid grid-cols-1 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(10rem,1fr)_2fr]"
    >
      <dt className="text-compact text-text-muted">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        {isKnown ? (
          <span className="text-compact font-semibold tabular-nums text-text">
            <bdi>
              {value}
              {unit ? ` ${unit}` : null}
            </bdi>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-compact">
            <span className="italic text-text-muted">{unknownLabel}</span>
            {confirmAction}
          </span>
        )}
        {isKnown && basis ? <span className="text-caption text-text">{basis}</span> : null}
        {isKnown && provenance ? (
          <span className="inline-flex items-center gap-1 text-caption text-text-muted">
            <HistoryIcon className="size-4" />
            {provenance}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
