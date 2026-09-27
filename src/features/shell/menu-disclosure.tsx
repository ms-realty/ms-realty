import type { ReactNode } from "react";
import { cx } from "@/ui/cx";
import { MenuIcon } from "@/ui/icons";

/** Native disclosure remains operable before hydration and with JavaScript disabled. */
export function MenuDisclosure({
  label,
  children,
  className,
  panelClassName,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  return (
    <details data-dismissible="" className={cx("group/menu relative", className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: summary is the native no-JS disclosure control; explicit role fixes its observed generic accessibility mapping. */}
      <summary
        role="button"
        className="inline-flex min-h-control items-center gap-2 rounded-control px-3 text-compact font-semibold text-text hover:bg-subtle group-open/menu:bg-selected"
      >
        <MenuIcon />
        {label}
      </summary>
      <div className={cx("min-w-56 border-t border-divider pt-3", panelClassName)}>{children}</div>
    </details>
  );
}
