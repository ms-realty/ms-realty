"use client";

import { type ReactNode, useId } from "react";
import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import { announce } from "./announce";
import { type ButtonVariant, buttonClass } from "./button-class";
import { cx } from "./cx";
import { Spinner } from "./icons";

export { type ButtonVariant, buttonClass };

export type ButtonProps = Omit<RACButtonProps, "children" | "className"> & {
  variant?: ButtonVariant;
  children: ReactNode;
  /** Replaces the label while `isPending`, e.g. "Sending question…". */
  pendingLabel?: string;
  /**
   * Why the action is unavailable. The button stays focusable (aria-disabled), does nothing
   * when activated, and its description and an announcement on activation give the reason.
   */
  disabledReason?: string;
  className?: string;
};

// The button keeps its width while pending (spec §17 UI05). A pending label shares one grid
// cell with the label, so the button is as wide as the longer of the two in either state;
// without one, the spinner covers the label, which stays the accessible name.
const stack = "col-start-1 row-start-1 flex items-center justify-center gap-2";

function Label({
  children,
  pendingLabel,
  isPending,
}: {
  children: ReactNode;
  pendingLabel: string | undefined;
  isPending: boolean;
}) {
  if (!pendingLabel) {
    return (
      <span className="relative flex items-center justify-center">
        <span className={cx("flex items-center gap-2", isPending && "opacity-0")}>{children}</span>
        {isPending ? <Spinner className="absolute" /> : null}
      </span>
    );
  }
  return (
    <span className="grid">
      <span className={cx(stack, isPending && "invisible")} aria-hidden={isPending || undefined}>
        {children}
      </span>
      <span className={cx(stack, !isPending && "invisible")} aria-hidden={!isPending || undefined}>
        <Spinner />
        <span>{pendingLabel}</span>
      </span>
    </span>
  );
}

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
  const describedBy = cx(props["aria-describedby"], disabledReason ? reasonId : undefined);

  if (!disabledReason) {
    return (
      <RACButton
        {...props}
        isPending={isPending}
        isDisabled={isDisabled}
        aria-describedby={describedBy || undefined}
        className={buttonClass(variant, className)}
      >
        <Label pendingLabel={pendingLabel} isPending={Boolean(isPending)}>
          {children}
        </Label>
      </RACButton>
    );
  }

  // Not RAC's isDisabled, which removes the button from the tab order and hides the reason
  // from keyboard and screen-reader users. A plain button keeps focus and never submits.
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        id={props.id}
        aria-label={props["aria-label"]}
        aria-disabled="true"
        aria-describedby={describedBy}
        data-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          announce(disabledReason);
        }}
        className={buttonClass(variant, className)}
      >
        {children}
      </button>
      <span id={reasonId} className="text-caption text-text-muted">
        {disabledReason}
      </span>
    </span>
  );
}
