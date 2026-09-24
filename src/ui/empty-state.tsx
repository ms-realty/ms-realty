import type { ReactNode } from "react";
import { cx } from "./cx";
import { ErrorIcon, FolderIcon, LockIcon, SearchIcon } from "./icons";

/**
 * Why there is nothing to show (spec §17.1): nothing yet, nothing matches the criteria,
 * loading failed, or the person may not see it. Each needs different words and a different
 * next action.
 */
export type EmptyKind = "new" | "filtered" | "failed" | "inaccessible";

const kinds = {
  new: { Icon: FolderIcon, tint: "text-action" },
  filtered: { Icon: SearchIcon, tint: "text-action" },
  failed: { Icon: ErrorIcon, tint: "text-error" },
  inaccessible: { Icon: LockIcon, tint: "text-text-muted" },
} satisfies Record<EmptyKind, unknown>;

export type EmptyStateProps = {
  kind: EmptyKind;
  title: string;
  children?: ReactNode;
  /** For "filtered": the exact criteria in force, kept visible (A06). */
  criteria?: ReactNode;
  /** One clear next action. */
  action?: ReactNode;
  /** For "failed": a support reference. */
  reference?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
};

export function EmptyState({
  kind,
  title,
  children,
  criteria,
  action,
  reference,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const { Icon, tint } = kinds[kind];
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      data-kind={kind}
      className={cx(
        "flex flex-col items-start gap-3 rounded-card border border-dashed border-border bg-surface p-6",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-subtle">
        <Icon className={cx("size-6", tint)} />
      </span>
      <Heading className="text-subheading font-semibold text-text">{title}</Heading>
      {children ? <div className="max-w-prose text-compact text-text-muted">{children}</div> : null}
      {criteria ? <div className="flex flex-wrap gap-2">{criteria}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
      {reference ? <p className="text-caption text-text-muted">{reference}</p> : null}
    </div>
  );
}
