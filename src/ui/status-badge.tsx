import { cx } from "./cx";
import {
  AssistIcon,
  ErrorIcon,
  InfoIcon,
  NeutralIcon,
  PendingIcon,
  SendIcon,
  StampIcon,
  SuccessIcon,
  WarningIcon,
} from "./icons";

export type StatusFamily = "availability" | "approval" | "delivery";
export type StatusTone =
  | "positive"
  | "attention"
  | "negative"
  | "info"
  | "pending"
  | "neutral"
  /** Proposed by the assistant or otherwise unreviewed: a person still has to decide. */
  | "draft";

const toneText: Record<StatusTone, string> = {
  positive: "text-success",
  attention: "text-warning",
  negative: "text-error",
  info: "text-info",
  pending: "text-text-muted",
  neutral: "text-text-muted",
  draft: "text-assist",
};

const toneSoft: Record<StatusTone, string> = {
  positive: "bg-success-soft",
  attention: "bg-warning-soft",
  negative: "bg-error-soft",
  info: "bg-info-soft",
  pending: "bg-subtle",
  neutral: "bg-subtle",
  draft: "bg-assist-soft",
};

const toneIcon = {
  positive: SuccessIcon,
  attention: WarningIcon,
  negative: ErrorIcon,
  info: InfoIcon,
  pending: PendingIcon,
  neutral: NeutralIcon,
  draft: AssistIcon,
} satisfies Record<StatusTone, unknown>;

// Each family has its own shape so "available" and "approved" never read as the same pill:
// availability is a soft pill, approval a bordered stamp, delivery plain inline text.
const familyClass: Record<StatusFamily, string> = {
  availability: "rounded-md px-2 py-0.5",
  approval: "rounded-[3px] border border-current bg-surface px-2 py-0.5",
  delivery: "",
};

export type StatusBadgeProps = {
  family: StatusFamily;
  tone: StatusTone;
  /** The status in words. Colour and icon only reinforce it. */
  label: string;
  className?: string;
};

export function StatusBadge({ family, tone, label, className }: StatusBadgeProps) {
  const Icon =
    family === "approval" && tone === "positive"
      ? StampIcon
      : family === "delivery" && tone === "info"
        ? SendIcon
        : toneIcon[tone];
  return (
    <span
      data-family={family}
      data-tone={tone}
      className={cx(
        "inline-flex w-fit items-center gap-1.5 text-caption font-semibold",
        toneText[tone],
        (family === "availability" || tone === "draft") && toneSoft[tone],
        tone === "draft" && "rounded-md border border-dashed border-assist-line px-2 py-0.5",
        familyClass[family],
        "forced-colors:border forced-colors:border-[CanvasText]",
        className,
      )}
    >
      <Icon className="size-4" />
      <span className={family === "availability" ? "text-text" : undefined}>{label}</span>
    </span>
  );
}
