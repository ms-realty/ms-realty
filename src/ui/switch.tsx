"use client";

import type { ReactNode } from "react";
import { Switch as RACSwitch, type SwitchProps as RACSwitchProps } from "react-aria-components";
import { cx } from "./cx";

export type SwitchProps = Omit<RACSwitchProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

/** An immediate on/off setting. Use a checkbox when the choice is submitted with a form. */
export function Switch({ children, className, ...props }: SwitchProps) {
  return (
    <RACSwitch
      {...props}
      className={cx(
        "group/switch flex min-h-control cursor-pointer items-center gap-3 text-compact text-text",
        "data-disabled:cursor-not-allowed data-disabled:text-disabled-text",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-border bg-subtle px-0.5 transition-colors duration-(--duration-fast)",
          "group-data-hovered/switch:border-text",
          "group-data-focus-visible/switch:outline-2 group-data-focus-visible/switch:outline-offset-2 group-data-focus-visible/switch:outline-focus",
          "group-data-selected/switch:border-action group-data-selected/switch:bg-action",
          "group-data-readonly/switch:border-dashed",
          "group-data-disabled/switch:border-disabled-text group-data-disabled/switch:bg-disabled",
        )}
      >
        <span
          className={cx(
            "size-5 rounded-full border border-border bg-surface shadow-raised transition-transform duration-(--duration-fast) ease-out",
            "group-data-selected/switch:translate-x-5 rtl:group-data-selected/switch:-translate-x-5",
            "forced-colors:bg-[CanvasText] forced-colors:group-data-selected/switch:bg-[Highlight]",
          )}
        />
      </span>
      <span>{children}</span>
    </RACSwitch>
  );
}
