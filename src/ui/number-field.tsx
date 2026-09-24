"use client";

import type { ReactNode } from "react";
import {
  Button,
  Group,
  Input,
  NumberField as RACNumberField,
  type NumberFieldProps as RACNumberFieldProps,
} from "react-aria-components";
import { cx } from "./cx";
import { Description, FieldError, fieldClass, Label } from "./field";
import { MinusIcon, PlusIcon } from "./icons";
import { VisuallyHidden } from "./visually-hidden";

export type NumberFieldProps = Omit<RACNumberFieldProps, "children" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  /** Unit shown after the value, e.g. "m²". It is also read as part of the label. */
  unit?: string;
  className?: string;
};

const stepperClass = cx(
  "flex size-control shrink-0 cursor-pointer items-center justify-center text-action outline-offset-[-2px]",
  "data-hovered:bg-selected data-pressed:bg-selected data-disabled:cursor-not-allowed data-disabled:text-disabled-text",
);

export function NumberField({
  label,
  description,
  errorMessage,
  optionalLabel,
  unit,
  className,
  ...props
}: NumberFieldProps) {
  return (
    <RACNumberField {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
        {unit ? <VisuallyHidden> ({unit})</VisuallyHidden> : null}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <Group
        className={cx(
          "flex w-full max-w-xs items-stretch overflow-hidden rounded-control border border-border bg-surface",
          "data-hovered:border-text data-focus-within:outline-2 data-focus-within:outline-offset-2 data-focus-within:outline-focus",
          "group-data-invalid:border-2 group-data-invalid:border-error",
          "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
          "group-data-disabled:border-disabled-text group-data-disabled:bg-disabled",
        )}
      >
        <Button slot="decrement" className={stepperClass}>
          <MinusIcon />
        </Button>
        <div className="flex min-w-0 flex-1 items-center border-x border-divider">
          <Input className="min-h-control w-full min-w-0 bg-transparent px-3 text-center text-compact tabular-nums text-text outline-none group-data-disabled:text-disabled-text" />
          {unit ? (
            <span aria-hidden="true" className="pe-3 text-compact text-text-muted">
              {unit}
            </span>
          ) : null}
        </div>
        <Button slot="increment" className={stepperClass}>
          <PlusIcon />
        </Button>
      </Group>
    </RACNumberField>
  );
}
