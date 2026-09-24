import type { ReactNode } from "react";
import { cx } from "./cx";
import { HistoryIcon, LockIcon, NeutralIcon, WarningIcon } from "./icons";

export function Timeline({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {children}
    </ol>
  );
}

export type TimelineKind = "event" | "correction" | "restricted" | "delayed";

const kindIcon = {
  event: { Icon: NeutralIcon, tint: "text-action" },
  correction: { Icon: HistoryIcon, tint: "text-info" },
  restricted: { Icon: LockIcon, tint: "text-text-muted" },
  delayed: { Icon: WarningIcon, tint: "text-warning" },
} satisfies Record<TimelineKind, unknown>;

export type TimelineItemProps = {
  /** What happened, in human terms. */
  title: string;
  actor?: string;
  time: { dateTime: string; label: string };
  /** Where the event came from, e.g. "Website inquiry form". */
  source?: string;
  /** A link to what the event caused, e.g. the task it created. */
  consequence?: ReactNode;
  kind?: TimelineKind;
  /** Visible wording for a non-default kind, e.g. "Correction" or "Details restricted". */
  kindLabel?: string;
};

export function TimelineItem({
  title,
  actor,
  time,
  source,
  consequence,
  kind = "event",
  kindLabel,
}: TimelineItemProps) {
  const { Icon, tint } = kindIcon[kind];
  return (
    <li data-kind={kind} className="relative flex gap-3 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute start-[0.6875rem] top-7 bottom-0 w-px bg-divider [li:last-child>&]:hidden"
      />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
        <Icon className={cx("size-5", tint)} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-operational">
        {kindLabel ? (
          <span
            className={cx("text-dense font-semibold", tint === "text-action" ? "text-text" : tint)}
          >
            {kindLabel}
          </span>
        ) : null}
        <p className="font-semibold text-text">{title}</p>
        <p className="flex flex-wrap gap-x-2 text-dense text-text-muted">
          <time dateTime={time.dateTime}>{time.label}</time>
          {actor ? <span>· {actor}</span> : null}
          {source ? <span>· {source}</span> : null}
        </p>
        {consequence ? <div className="pt-0.5 text-dense">{consequence}</div> : null}
      </div>
    </li>
  );
}
