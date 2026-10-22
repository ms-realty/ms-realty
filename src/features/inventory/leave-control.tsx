"use client";
// O12: leaving the editor. Without JavaScript this is a submit control of the editor form
// (`_leave`), so the server can tell an unchanged draft (go) from unsaved work (Save draft /
// Discard / Stay). With JavaScript it is a plain link that UnsavedGuard intercepts.
import { type ReactNode, useEffect, useState } from "react";

export function LeaveControl({
  href,
  formId,
  className,
  children,
  current,
}: {
  href: string;
  formId?: string;
  className?: string;
  children: ReactNode;
  current?: boolean;
}) {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  return enhanced || !formId ? (
    <a href={href} className={className} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  ) : (
    <button
      type="submit"
      form={formId}
      name="_leave"
      value={href}
      className={className}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </button>
  );
}
