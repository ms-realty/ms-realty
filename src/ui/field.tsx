"use client";

import type { ReactNode } from "react";
import {
  FieldError as RACFieldError,
  Label as RACLabel,
  Popover as RACPopover,
  type PopoverProps as RACPopoverProps,
  Text,
} from "react-aria-components";
import { cx } from "./cx";
import { labelClass } from "./field-class";
import { ErrorIcon } from "./icons";

// Shared field anatomy (GOV.UK order): label, hint, error, control.

export { controlClass, fieldClass, labelClass } from "./field-class";

export function Label({
  children,
  optionalLabel,
  isRequired,
}: {
  children: ReactNode;
  /** Shown after the label when the field is optional, e.g. "(optional)". */
  optionalLabel?: string;
  isRequired?: boolean;
}) {
  return (
    <RACLabel className={labelClass}>
      {children}
      {optionalLabel && !isRequired ? (
        <span className="font-normal text-text-muted"> {optionalLabel}</span>
      ) : null}
    </RACLabel>
  );
}

export function Description({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <Text slot="description" className="text-caption text-text-muted">
      {children}
    </Text>
  );
}

/** The error text for the surrounding field; rendered only while the field is invalid. */
export function FieldError({ children }: { children?: ReactNode }) {
  return (
    <RACFieldError className="flex items-start gap-1.5 text-compact font-semibold text-error">
      <ErrorIcon className="mt-0.5" />
      <span>{children}</span>
    </RACFieldError>
  );
}

export function ListPopover({ className, ...props }: RACPopoverProps & { className?: string }) {
  return (
    <RACPopover
      offset={4}
      className={cx(
        "z-(--z-popover) max-h-80 min-w-(--trigger-width) overflow-auto rounded-control border border-border bg-surface shadow-overlay",
        className,
      )}
      {...props}
    />
  );
}

export const optionClass = cx(
  "flex min-h-control cursor-default items-center gap-2 px-3 py-2 text-compact text-text outline-none",
  "data-focused:bg-selected data-selected:font-semibold data-disabled:text-disabled-text",
  "forced-colors:data-focused:bg-[Highlight] forced-colors:data-focused:text-[HighlightText]",
);
