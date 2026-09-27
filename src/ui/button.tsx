"use client";

import { type ReactNode, useId } from "react";
import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import { cx } from "./cx";
import { Spinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

const variants: Record<ButtonVariant, string> = {
  // Filled variants keep a transparent border so the outline survives forced-colors mode.
  primary: cx(
    "border-transparent bg-action text-text-inverse data-hovered:bg-action-hover data-pressed:bg-action-pressed",
  ),
  // Neutral edge at rest; the action colour arrives on hover so one primary stays dominant.
  secondary: cx(
    "border-border bg-surface text-action data-hovered:border-action data-hovered:bg-selected",
    "data-pressed:border-action-pressed data-pressed:bg-selected data-pressed:text-action-pressed",
  ),
  tertiary: cx(
    "border-transparent bg-transparent text-action",
    "data-hovered:bg-subtle data-pressed:bg-divider",
  ),
  destructive: cx(
    "border-transparent bg-error text-text-inverse data-hovered:bg-error-hover data-pressed:bg-error-pressed",
  ),
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cx(
    "inline-flex min-h-control min-w-control select-none items-center justify-center gap-2 rounded-control border px-5 py-2",
    "text-compact font-semibold transition-[color,background-color,border-color,box-shadow] duration-(--duration-fast) ease-(--ease-out) cursor-pointer",
    variants[variant],
    "data-pending:cursor-wait",
    "data-disabled:cursor-not-allowed data-disabled:border-disabled data-disabled:bg-disabled data-disabled:text-disabled-text data-disabled:no-underline",
    "forced-colors:data-disabled:border-[GrayText] forced-colors:data-disabled:text-[GrayText]",
    className,
  );

export type ButtonProps = Omit<RACButtonProps, "children" | "className"> & {
  variant?: ButtonVariant;
  children: ReactNode;
  /** Replaces the label while `isPending`, e.g. "Sending question…". */
  pendingLabel?: string;
  /** Why the action is unavailable. Disables the button and shows the reason beside it. */
  disabledReason?: string;
  className?: string;
};

export function Button({
  variant = "primary",
  children,
  pendingLabel,
  disabledReason,
  className,
  isDisabled,
  isPending,
  ...props
}: ButtonProps) {
  const reasonId = useId();
  const button = (
    <RACButton
      {...props}
      isPending={isPending}
      isDisabled={isDisabled || Boolean(disabledReason)}
      aria-describedby={
        cx(props["aria-describedby"], disabledReason ? reasonId : undefined) || undefined
      }
      className={buttonClass(variant, className)}
    >
      {isPending ? (
        <>
          <Spinner />
          <span>{pendingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </RACButton>
  );
  if (!disabledReason) return button;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <span id={reasonId} className="text-caption text-text-muted">
        {disabledReason}
      </span>
    </span>
  );
}
