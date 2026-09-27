import type { ReactNode } from "react";
import { cx } from "./cx";
import { AssistIcon, CalendarIcon, ClockIcon, ErrorIcon, SuccessIcon } from "./icons";
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

/** Consequence, never decoration: only failed external effects are red (spec F19). */
export type TaskSeverity = "consequential" | "due" | "planned" | "draft";

const severityRail: Record<TaskSeverity, string> = {
  consequential: "bg-error",
  due: "bg-warning",
  planned: "bg-divider",
  draft: "bg-assist-line",
};
const severityTile: Record<TaskSeverity, string> = {
  consequential: "bg-error-soft text-error",
  due: "bg-warning-soft text-warning",
  planned: "bg-subtle text-text-muted",
  draft: "bg-assist-soft text-assist",
};
const severityIcon = {
  consequential: ErrorIcon,
  due: ClockIcon,
  planned: CalendarIcon,
  draft: AssistIcon,
} satisfies Record<TaskSeverity, unknown>;

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
  /** Draws the rail and icon tile; omit for a plain row. */
  severity?: TaskSeverity;
  /** The one direct action, e.g. a secondary ButtonLink "Reply". */
  directAction?: ReactNode;
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
  severity,
  directAction,
}: TaskRowProps) {
  const isDone = Boolean(completedEvidence);
  const SeverityIcon = severity ? severityIcon[severity] : null;
  return (
    <li
      className="flex items-center gap-3.5 px-4 py-3 text-operational"
      data-done={isDone}
      data-severity={severity}
    >
      {severity && SeverityIcon ? (
        <>
          <span
            aria-hidden="true"
            className={cx("h-10 w-1 shrink-0 rounded-full", severityRail[severity])}
          />
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
              severityTile[severity],
            )}
          >
            <SeverityIcon className="size-[1.125rem]" />
          </span>
        </>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <Link
            href={href}
            className={cx("font-semibold", isDone ? "text-text-muted" : "text-link")}
          >
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
      </div>
      {directAction ? <div className="shrink-0">{directAction}</div> : null}
    </li>
  );
}
