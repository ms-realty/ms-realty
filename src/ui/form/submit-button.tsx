"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

const labels: Record<string, string> = {
  bg: "Изпращане…",
  en: "Submitting…",
  ru: "Отправка…",
  de: "Wird gesendet…",
  nl: "Bezig met verzenden…",
  el: "Αποστολή…",
  he: "שליחה…",
};

/** A Server Function's native form owns pending state and progressive enhancement. */
export function SubmitButton({
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const locale = typeof document === "undefined" ? "bg" : document.documentElement.lang;
  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? <span role="status">{labels[locale] ?? labels.en}</span> : children}
    </button>
  );
}
