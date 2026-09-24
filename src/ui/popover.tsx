"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  Heading,
  Popover as RACPopover,
  type PopoverProps as RACPopoverProps,
} from "react-aria-components";
import { cx } from "./cx";

export type PopoverProps = Omit<RACPopoverProps, "children" | "className"> & {
  /** Visible heading; it names the popover for assistive technology. */
  title: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Non-modal panel anchored to its trigger (use inside a DialogTrigger). */
export function Popover({ title, children, className, ...props }: PopoverProps) {
  return (
    <RACPopover
      offset={8}
      {...props}
      className={cx(
        "z-(--z-popover) w-[min(22rem,calc(100vw-2rem))] rounded-control border border-border bg-surface shadow-overlay",
        className,
      )}
    >
      <Dialog className="flex flex-col gap-2 p-4 outline-none">
        <Heading slot="title" className="text-compact font-semibold">
          {title}
        </Heading>
        <div className="text-compact text-text">{children}</div>
      </Dialog>
    </RACPopover>
  );
}
