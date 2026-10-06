"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "../cx";
import { controlClass, fieldClass } from "../field-class";

type Shared = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
};

/** Native controls retain their server-rendered value and associations before hydration. */
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
    | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  )) {
  const describedBy = cx(hint && `${props.id}-hint`, error && `${props.id}-error`);
  const common = {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": Boolean(error) || undefined,
    className: cx(controlClass, "py-2", props.readOnly && "bg-subtle"),
  } as const;
  return (
    <div className={fieldClass} data-invalid={error ? "true" : undefined}>
      <label htmlFor={props.id} className="text-compact font-semibold text-text">
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
          rows={(props as TextareaHTMLAttributes<HTMLTextAreaElement>).rows ?? 5}
        />
      ) : (
        <input {...(props as InputHTMLAttributes<HTMLInputElement>)} {...common} />
      )}
      {/* UI06 Error: the message sits under the field it belongs to. */}
      {error ? (
        <p id={`${props.id}-error`} className="text-compact font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
