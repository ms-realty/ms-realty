// Button styling as plain classes, with no client code: server components (shell links, a
// no-JavaScript form submit) and the React Aria Button share one look. React Aria sets the
// data-* state attributes; native elements get the same look from :hover/:active/:disabled.
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "assist";

const variants: Record<ButtonVariant, string> = {
  // Filled variants keep a transparent border so the outline survives forced-colors mode.
  primary: cx(
    "border-transparent bg-action text-text-inverse",
    "hover:bg-action-hover data-hovered:bg-action-hover active:bg-action-pressed data-pressed:bg-action-pressed",
  ),
  // Neutral edge at rest; the action colour arrives on hover so one primary stays dominant.
  secondary: cx(
    "border-border bg-surface text-action",
    "hover:border-action hover:bg-selected data-hovered:border-action data-hovered:bg-selected",
    "active:bg-selected data-pressed:border-action-pressed data-pressed:bg-selected data-pressed:text-action-pressed",
  ),
  tertiary: cx(
    "border-transparent bg-transparent text-action",
    "hover:bg-subtle data-hovered:bg-subtle active:bg-selected data-pressed:bg-selected",
  ),
  destructive: cx(
    "border-transparent bg-error text-text-inverse",
    "hover:bg-error-hover data-hovered:bg-error-hover active:bg-error-pressed data-pressed:bg-error-pressed",
  ),
  // Butler draft entry (Figma UI04 State=AI): tinted, never filled, so asking for a draft
  // never outranks the person's own next action.
  assist: cx(
    "border-transparent bg-assist-soft text-assist",
    "hover:border-assist-line data-hovered:border-assist-line active:border-assist-line data-pressed:border-assist-line",
  ),
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cx(
    "inline-flex min-h-control min-w-control cursor-pointer select-none items-center justify-center gap-2 rounded-control border px-5 py-2",
    "text-compact font-semibold no-underline transition-[color,background-color,border-color] duration-(--duration-fast) ease-out",
    variants[variant],
    "data-pending:cursor-wait",
    "disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-text",
    "data-disabled:cursor-not-allowed data-disabled:border-disabled data-disabled:bg-disabled data-disabled:text-disabled-text",
    "forced-colors:data-disabled:border-[GrayText] forced-colors:data-disabled:text-[GrayText]",
    className,
  );
