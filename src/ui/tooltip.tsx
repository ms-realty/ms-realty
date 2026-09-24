"use client";

import type { ReactNode } from "react";
import { Tooltip as RACTooltip, TooltipTrigger } from "react-aria-components";

export type TooltipProps = {
  /** Supplementary hint only. Anything a person needs to act belongs in visible text. */
  content: ReactNode;
  /** A single focusable element that already has its own accessible name. */
  children: ReactNode;
};

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <TooltipTrigger delay={500}>
      {children}
      <RACTooltip
        offset={6}
        className="z-(--z-popover) max-w-xs rounded-control bg-text px-2.5 py-1.5 text-caption text-text-inverse shadow-overlay forced-colors:border"
      >
        {content}
      </RACTooltip>
    </TooltipTrigger>
  );
}
