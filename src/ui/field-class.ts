// Shared native control styles; safe to import from server and client components.
import { cx } from "./cx";

export const controlClass = cx(
  "min-h-control w-full rounded-control border border-border bg-surface px-3 text-compact text-text",
  "placeholder:text-text-muted transition-colors duration-(--duration-fast)",
  "data-hovered:border-text",
  "group-data-invalid:border-2 group-data-invalid:border-error",
  "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
  "group-data-disabled:cursor-not-allowed group-data-disabled:border-disabled-text group-data-disabled:bg-disabled group-data-disabled:text-disabled-text",
  "forced-colors:group-data-disabled:border-[GrayText] forced-colors:group-data-disabled:text-[GrayText]",
);

export const fieldClass = "group flex flex-col gap-1.5";
