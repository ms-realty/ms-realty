"use client";

import { useEffect, useId, useRef } from "react";
import { CircleAlertIcon } from "./icons";

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
 * A17 error-summary behavior with Figma UI26 (6:416) presentation: shown above the form
 * after a failed submission, takes focus, and links to the fields that need correcting.
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
      className="flex items-start gap-3 rounded-control bg-danger-tint p-4 text-dense font-normal text-text focus-visible:outline-offset-4 forced-colors:border forced-colors:border-current"
    >
      <CircleAlertIcon className="text-error" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <h2 id={titleId} className="font-normal">
          {title}
        </h2>
        <ul>
          {errors.map((error) => (
            <li key={error.fieldId} className="[text-wrap:wrap]">
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
                className="text-text underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
