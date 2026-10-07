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
    <details
      data-dismissible=""
      className={cx("group/menu relative [&:not([open])>div]:hidden", className)}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: summary is the native no-JS disclosure control; explicit role fixes its observed generic accessibility mapping. */}
      <summary
        role="button"
        className="inline-flex min-h-control items-center gap-2 rounded-control px-3 text-compact font-semibold text-text hover:bg-subtle group-open/menu:bg-selected"
      >
        <MenuIcon />
        {label}
      </summary>
      <div
        className={cx(
          "absolute end-0 z-20 w-56 max-w-[calc(100vw-2rem)] rounded-control border border-divider bg-surface p-3",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
