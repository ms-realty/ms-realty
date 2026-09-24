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
import { CheckIcon, MinusIcon } from "./icons";

export type CheckboxProps = Omit<RACCheckboxProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <RACCheckbox
      {...props}
      className={cx(
        "group/checkbox flex min-h-control cursor-pointer items-center gap-3 text-compact text-text",
        "data-disabled:cursor-not-allowed data-disabled:text-disabled-text",
        className,
      )}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span
            aria-hidden="true"
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-[4px] border-2 border-border bg-surface text-text-inverse",
              "group-data-hovered/checkbox:border-text",
              "group-data-focus-visible/checkbox:outline-2 group-data-focus-visible/checkbox:outline-offset-2 group-data-focus-visible/checkbox:outline-focus",
              "group-data-selected/checkbox:border-action group-data-selected/checkbox:bg-action",
              "group-data-indeterminate/checkbox:border-action group-data-indeterminate/checkbox:bg-action",
              "group-data-invalid/checkbox:border-error",
              "group-data-readonly/checkbox:border-dashed",
              "group-data-disabled/checkbox:border-disabled-text group-data-disabled/checkbox:bg-disabled group-data-disabled/checkbox:text-disabled-text",
              "forced-colors:group-data-selected/checkbox:bg-[Highlight] forced-colors:group-data-selected/checkbox:text-[HighlightText]",
            )}
          >
            {isIndeterminate ? (
              <MinusIcon className="size-4" strokeWidth={3} />
            ) : isSelected ? (
              <CheckIcon className="size-4" strokeWidth={3} />
            ) : null}
          </span>
          <span>{children}</span>
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
