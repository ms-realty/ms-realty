"use client";

import type { ReactNode } from "react";
import {
  Input,
  TextArea as RACTextArea,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
} from "react-aria-components";
import { cx } from "./cx";
import { controlClass, Description, FieldError, fieldClass, Label, textareaClass } from "./field";

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
      <Input placeholder={placeholder} dir={inputDir} className={controlClass} />
      <FieldError>{errorMessage}</FieldError>
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
  // UI07 draws 144 px, which four rows fill.
  rows = 4,
  className,
  ...props
}: TextAreaProps) {
  return (
    <RACTextField {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <RACTextArea rows={rows} placeholder={placeholder} dir={inputDir} className={textareaClass} />
      <FieldError>{errorMessage}</FieldError>
    </RACTextField>
  );
}
