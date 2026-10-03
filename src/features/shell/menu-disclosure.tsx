import type { ReactNode } from "react";
import { cx } from "@/ui/cx";
import { ChevronDownIcon } from "@/ui/icons";

/**
 * Compact-width navigation as a native disclosure: it opens and closes without JavaScript, and
 * the shell's DisclosureBehavior adds Escape, outside-click and close-on-navigation.
 */
export function MenuDisclosure({
  label,
  children,
  className,
  panelClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  return (
    <details data-dismissible="" className={cx("group/menu contents", className)}>
      <summary
        className={cx(
          "inline-flex min-h-control cursor-pointer items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-compact font-semibold text-action",
          "transition-colors duration-(--duration-fast) hover:bg-selected group-open/menu:bg-selected",
        )}
      >
        {label}
        <ChevronDownIcon className="size-4 transition-transform duration-(--duration-fast) group-open/menu:rotate-180" />
      </summary>
      <div className={cx("order-last basis-full", panelClassName)}>{children}</div>
    </details>
  );
}
