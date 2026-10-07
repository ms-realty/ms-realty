"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "../cx";
import {
  controlClass,
  errorClass,
  fieldClass,
  labelClass,
  textareaClass,
  wrapControlClass,
} from "../field-class";

type Shared = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
};

/**
 * Native controls retain their server-rendered value and associations before hydration.
 * `multiline` is a UI07 writing surface; `multiline="wrap"` is a UI06 field whose value wraps
 * onto more lines instead of running out of sight.
 */
export function FormField({
  label,
  hint,
  error,
  optionalLabel,
  multiline,
  ...props
}: Shared &
  (
    | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
    | ({ multiline: true | "wrap" } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  )) {
  const describedBy = cx(hint && `${props.id}-hint`, error && `${props.id}-error`);
  const surface =
    multiline === "wrap" ? wrapControlClass : multiline ? textareaClass : controlClass;
  const common = {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": Boolean(error) || undefined,
    className: cx(surface, props.readOnly && "bg-subtle"),
  } as const;
  return (
    <div className={fieldClass} data-invalid={error ? "true" : undefined}>
      <label htmlFor={props.id} className={labelClass}>
        {label}
        {optionalLabel ? (
          <span className="font-normal text-text-muted"> {optionalLabel}</span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${props.id}-hint`} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          {...common}
          // UI07 draws 144 px, which four rows fill; a wrapping field shows two lines wherever
          // the browser cannot size it to its value.
          rows={
            (props as TextareaHTMLAttributes<HTMLTextAreaElement>).rows ??
            (multiline === "wrap" ? 2 : 4)
          }
        />
      ) : (
        <input {...(props as InputHTMLAttributes<HTMLInputElement>)} {...common} />
      )}
      {/* UI06 Error (6:68): the message sits 8 px under the field it belongs to. */}
      {error ? (
        <p id={`${props.id}-error`} className={errorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
