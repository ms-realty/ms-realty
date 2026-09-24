"use client";

import { useEffect, useRef } from "react";
import { Label, ProgressBar } from "react-aria-components";
import { announce } from "./announce";
import { cx } from "./cx";

export type ProgressProps = {
  label: string;
  /** 0–100; omit for an indeterminate operation. */
  value?: number;
  /** Announced once when value reaches 100. */
  completeLabel?: string;
  className?: string;
};

/**
 * Progress for a long-running job. The start and the completion are each announced once;
 * intermediate values are available on demand but never chatter.
 */
export function Progress({ label, value, completeLabel, className }: ProgressProps) {
  const announcedStart = useRef(false);
  const announcedDone = useRef(false);
  const isComplete = value !== undefined && value >= 100;

  useEffect(() => {
    if (announcedStart.current) return;
    announcedStart.current = true;
    announce(label);
  }, [label]);

  useEffect(() => {
    if (!isComplete || !completeLabel || announcedDone.current) return;
    announcedDone.current = true;
    announce(completeLabel);
  }, [isComplete, completeLabel]);

  return (
    <ProgressBar
      value={value}
      isIndeterminate={value === undefined}
      className={cx("flex w-full flex-col gap-1.5", className)}
    >
      {({ percentage, valueText, isIndeterminate }) => (
        <>
          <div className="flex items-baseline justify-between gap-4 text-compact">
            <Label className="font-semibold text-text">{label}</Label>
            {isIndeterminate ? null : (
              <span className="tabular-nums text-text-muted">{valueText}</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-subtle">
            <div
              className={cx(
                "h-full rounded-full bg-action forced-colors:bg-[Highlight]",
                isIndeterminate && "w-1/3 animate-pulse motion-reduce:animate-none",
              )}
              style={isIndeterminate ? undefined : { width: `${percentage ?? 0}%` }}
            />
          </div>
        </>
      )}
    </ProgressBar>
  );
}
