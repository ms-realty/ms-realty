"use client";

import type { ReactNode } from "react";
import {
  Input,
  TextArea as RACTextArea,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
} from "react-aria-components";
import { cx } from "./cx";
import { controlClass, Description, FieldError, fieldClass, Label } from "./field";

type SharedProps = Omit<RACTextFieldProps, "children" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  /** Marks an optional field, e.g. "(optional)". Required fields are not starred. */
  optionalLabel?: string;
  placeholder?: string;
  /** Base direction for mixed-direction values (references, e-mail, phone): usually "ltr". */
  inputDir?: "ltr" | "rtl" | "auto";
  className?: string;
};

export type TextFieldProps = SharedProps;

export function TextField({
  label,
  description,
  errorMessage,
  optionalLabel,
  placeholder,
  inputDir,
  className,
  ...props
}: TextFieldProps) {
  return (
    <RACTextField {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <Input placeholder={placeholder} dir={inputDir} className={cx(controlClass, "py-2")} />
    </RACTextField>
  );
}

export type TextAreaProps = SharedProps & { rows?: number };

export function TextArea({
  label,
  description,
  errorMessage,
  optionalLabel,
  placeholder,
  inputDir,
  rows = 5,
  className,
  ...props
}: TextAreaProps) {
  return (
    <RACTextField {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <RACTextArea
        rows={rows}
        placeholder={placeholder}
        dir={inputDir}
        className={cx(controlClass, "resize-y py-2 leading-6")}
      />
    </RACTextField>
  );
}
