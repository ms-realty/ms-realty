"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { SuccessIcon } from "./icons";

export type ReceiptProps = {
  /** The confirmed outcome only, e.g. "Your request was received". */
  title: string;
  referenceLabel: string;
  /** Stable reference the person can quote; isolated so it reads correctly in RTL. */
  reference: string;
  /** When the outcome was recorded. */
  recordedAt: { dateTime: string; label: string };
  recordedAtLabel: string;
  /** Optional status, e.g. a delivery StatusBadge. */
  status?: ReactNode;
  /** What happens next, in plain words. */
  children?: ReactNode;
  actions?: ReactNode;
  /** Move focus to the title when the receipt replaces a submitted form. */
  focusOnMount?: boolean;
  headingLevel?: 1 | 2 | 3;
};

/** Durable record of a consequential outcome (spec §17.2): never a toast. */
export function Receipt({
  title,
  referenceLabel,
  reference,
  recordedAt,
  recordedAtLabel,
  status,
  children,
  actions,
  focusOnMount,
  headingLevel = 2,
}: ReceiptProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const Heading = `h${headingLevel}` as const;

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-card border border-success bg-surface p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <SuccessIcon className="mt-1 size-7 text-success" />
        <Heading
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="text-heading font-semibold text-text"
        >
          {title}
        </Heading>
      </div>
      <dl className="grid gap-x-6 gap-y-2 rounded-control bg-subtle p-4 text-compact sm:grid-cols-[auto_1fr]">
        <dt className="text-text-muted">{referenceLabel}</dt>
        <dd className="font-semibold tabular-nums text-text">
          <bdi>{reference}</bdi>
        </dd>
        <dt className="text-text-muted">{recordedAtLabel}</dt>
        <dd className="text-text">
          <time dateTime={recordedAt.dateTime}>{recordedAt.label}</time>
        </dd>
      </dl>
      {status}
      {children ? (
        <div className="flex flex-col gap-2 text-compact text-text">{children}</div>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
