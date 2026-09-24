"use client";

import { useEffect, useId, useRef } from "react";
import { ErrorIcon } from "./icons";

export type ErrorSummaryItem = {
  /** id of the field's input, so the link can move focus to it. */
  fieldId: string;
  message: string;
};

export type ErrorSummaryProps = {
  title: string;
  errors: ErrorSummaryItem[];
};

/**
 * GOV.UK error summary (A17): shown above the form after a failed submission, takes focus
 * when it appears, and each message links to the field that needs correcting.
 */
export function ErrorSummary({ title, errors }: ErrorSummaryProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const signature = errors.map((error) => `${error.fieldId}:${error.message}`).join("|");

  // Refocus whenever the set of errors changes.
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);

  if (errors.length === 0) return null;

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card border-2 border-error bg-surface p-5 focus-visible:outline-offset-4"
    >
      <h2 id={titleId} className="flex items-center gap-2 text-subheading font-semibold text-text">
        <ErrorIcon className="text-error" />
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5 ps-7">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              onClick={(event) => {
                const field = document.getElementById(error.fieldId);
                if (!field) return;
                event.preventDefault();
                field.focus();
                // Bring the label into view with the field, as GOV.UK does.
                const label = field instanceof HTMLInputElement ? field.labels?.[0] : undefined;
                (label ?? field).scrollIntoView?.({ block: "center" });
              }}
              className="font-semibold text-error underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
