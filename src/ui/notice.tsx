import type { ReactNode } from "react";
import { cx } from "./cx";
import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "error";

const tones = {
  info: { box: "border-info bg-info-soft", icon: "text-info", Icon: InfoIcon },
  success: { box: "border-success bg-success-soft", icon: "text-success", Icon: SuccessIcon },
  warning: { box: "border-warning bg-warning-soft", icon: "text-warning", Icon: WarningIcon },
  error: { box: "border-error bg-error-soft", icon: "text-error", Icon: ErrorIcon },
} satisfies Record<NoticeTone, unknown>;

export type NoticeProps = {
  tone: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** One follow-up action, e.g. a link or button. */
  action?: ReactNode;
  /** Pass "alert"/"status" only when the notice appears in response to an action. */
  role?: "alert" | "status";
  className?: string;
};

/** Inline feedback about part of a page. */
export function Notice({ tone, title, children, action, role, className }: NoticeProps) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      role={role}
      className={cx("flex gap-3 rounded-card border p-4 text-compact", box, className)}
    >
      <Icon className={cx("mt-0.5", icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold text-text">{title}</p> : null}
        {children ? <div className="text-text">{children}</div> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}

/** Persistent, record- or page-wide risk (spec §17.2). Spans the full width of its container. */
export function Banner({ tone, title, children, action, role, className }: NoticeProps) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div role={role} className={cx("border-y px-4 py-3 text-compact sm:px-6", box, className)}>
      <div className="mx-auto flex max-w-page flex-wrap items-start gap-x-3 gap-y-2">
        <Icon className={cx("mt-0.5", icon)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title ? <p className="font-semibold text-text">{title}</p> : null}
          {children ? <div className="text-text">{children}</div> : null}
        </div>
        {/* Caps at the row so several actions wrap on narrow phones instead of overflowing. */}
        {action ? (
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>
    </div>
  );
}
