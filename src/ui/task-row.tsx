import type { ReactNode } from "react";
import { cx } from "./cx";
import { ClockIcon, SuccessIcon } from "./icons";
import { Link } from "./link";

export function TaskList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y divide-divider rounded-card border border-divider bg-surface"
    >
      {children}
    </ul>
  );
}

export type TaskRowProps = {
  href: string;
  /** Verb and object, e.g. "Call back about the Sandanski apartment". */
  action: string;
  /** Why it matters now. */
  reason?: string;
  /** Owner's name, or the "Unassigned" wording. */
  owner: string;
  isUnassigned?: boolean;
  due?: { dateTime: string; label: string };
  /** e.g. "Overdue by 2 days". Overdue is attention, not an emergency. */
  overdueLabel?: string;
  /** What the task waits on, e.g. "Waiting for: owner's floor plan". */
  waitingFor?: string;
  /** When done: the evidence, e.g. "Done 14 Sep · call logged". */
  completedEvidence?: string;
  /** A StatusBadge, when the task has a status of its own. */
  status?: ReactNode;
};

export function TaskRow({
  href,
  action,
  reason,
  owner,
  isUnassigned,
  due,
  overdueLabel,
  waitingFor,
  completedEvidence,
  status,
}: TaskRowProps) {
  const isDone = Boolean(completedEvidence);
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-operational" data-done={isDone}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <Link href={href} className={cx("font-semibold", isDone ? "text-text-muted" : "text-link")}>
          {action}
        </Link>
        {status}
      </div>
      {reason ? <p className="text-text">{reason}</p> : null}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-dense text-text-muted">
        <span className={cx(isUnassigned && "font-semibold text-warning")}>{owner}</span>
        {due ? (
          <span
            className={cx(
              "inline-flex items-center gap-1",
              overdueLabel && "font-semibold text-warning",
            )}
          >
            <ClockIcon className="size-4" />
            <time dateTime={due.dateTime}>{due.label}</time>
            {overdueLabel ? <span>· {overdueLabel}</span> : null}
          </span>
        ) : null}
        {waitingFor ? <span>{waitingFor}</span> : null}
        {completedEvidence ? (
          <span className="inline-flex items-center gap-1 text-success">
            <SuccessIcon className="size-4" />
            {completedEvidence}
          </span>
        ) : null}
      </p>
    </li>
  );
}
