"use client";

import type { ReactNode } from "react";
import {
  Checkbox as RACCheckbox,
  CheckboxGroup as RACCheckboxGroup,
  type CheckboxGroupProps as RACCheckboxGroupProps,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";
import { cx } from "./cx";
import { Description, FieldError, Label } from "./field";

export type CheckboxProps = Omit<RACCheckboxProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <RACCheckbox
      {...props}
      className={cx(
        // UI09 (6:111): 14/20 label, 12 px inset and a 20 px mark inside a 44 px row.
        "group/checkbox flex min-h-control min-w-0 cursor-pointer items-start gap-3 p-3 text-dense text-text",
        "data-disabled:cursor-not-allowed data-disabled:text-disabled-text",
        className,
      )}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span
            aria-hidden="true"
            className={cx(
              "flex size-5 shrink-0 items-center justify-center rounded-control border border-border bg-canvas text-text-inverse",
              "group-data-hovered/checkbox:border-text",
              "group-data-focus-visible/checkbox:outline-2 group-data-focus-visible/checkbox:outline-offset-2 group-data-focus-visible/checkbox:outline-focus",
              "group-data-selected/checkbox:border-action group-data-selected/checkbox:bg-action",
              "group-data-indeterminate/checkbox:border-action group-data-indeterminate/checkbox:bg-action",
              "group-data-invalid/checkbox:border-error",
              "group-data-readonly/checkbox:border-dashed",
              "group-data-disabled/checkbox:border-disabled-text group-data-disabled/checkbox:bg-disabled group-data-disabled/checkbox:text-disabled-text",
              "forced-colors:group-data-selected/checkbox:bg-[Highlight] forced-colors:group-data-selected/checkbox:text-[HighlightText]",
              "forced-colors:group-data-indeterminate/checkbox:bg-[Highlight] forced-colors:group-data-indeterminate/checkbox:text-[HighlightText]",
            )}
          >
            {isIndeterminate ? (
              <span className="h-0.5 w-2.5 rounded-[1px] bg-current" />
            ) : isSelected ? (
              // The UI09 check asset (6:103), on its original 20 px grid.
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
                className="shrink-0"
              >
                <path d="M16.6667 5L7.5 14.1667L3.33333 10" />
              </svg>
            ) : null}
          </span>
          <span className="min-w-0 flex-1 break-words">{children}</span>
        </>
      )}
    </RACCheckbox>
  );
}

export type CheckboxGroupProps = Omit<RACCheckboxGroupProps, "children" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
};

export function CheckboxGroup({
  label,
  description,
  errorMessage,
  optionalLabel,
  children,
  className,
  ...props
}: CheckboxGroupProps) {
  return (
    <RACCheckboxGroup {...props} className={cx("group flex flex-col gap-1", className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <div className="flex flex-col">{children}</div>
    </RACCheckboxGroup>
  );
}
