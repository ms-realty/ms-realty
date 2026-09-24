"use client";

import type { ReactNode } from "react";
import {
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioGroupProps as RACRadioGroupProps,
  type RadioProps as RACRadioProps,
} from "react-aria-components";
import { cx } from "./cx";
import { Description, FieldError, Label } from "./field";

export type RadioGroupProps = Omit<RACRadioGroupProps, "children" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
};

export function RadioGroup({
  label,
  description,
  errorMessage,
  optionalLabel,
  children,
  className,
  ...props
}: RadioGroupProps) {
  return (
    <RACRadioGroup {...props} className={cx("group flex flex-col gap-1", className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <div className="flex flex-col group-data-[orientation=horizontal]:flex-row group-data-[orientation=horizontal]:flex-wrap group-data-[orientation=horizontal]:gap-x-6">
        {children}
      </div>
    </RACRadioGroup>
  );
}

export type RadioProps = Omit<RACRadioProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

export function Radio({ children, className, ...props }: RadioProps) {
  return (
    <RACRadio
      {...props}
      className={cx(
        "group/radio flex min-h-control cursor-pointer items-center gap-3 text-compact text-text",
        "data-disabled:cursor-not-allowed data-disabled:text-disabled-text",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          // The selected state is a thick ring, which survives forced-colors mode.
          "size-6 shrink-0 rounded-full border-2 border-border bg-surface transition-[border-width] duration-(--duration-fast)",
          "group-data-hovered/radio:border-text",
          "group-data-focus-visible/radio:outline-2 group-data-focus-visible/radio:outline-offset-2 group-data-focus-visible/radio:outline-focus",
          "group-data-selected/radio:border-[7px] group-data-selected/radio:border-action",
          "group-data-invalid/radio:border-error",
          "group-data-readonly/radio:border-dashed",
          "group-data-disabled/radio:border-disabled-text group-data-disabled/radio:bg-disabled",
        )}
      />
      <span>{children}</span>
    </RACRadio>
  );
}
