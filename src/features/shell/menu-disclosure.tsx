"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Disclosure, DisclosurePanel } from "react-aria-components";
import { Button, cx, icons } from "@/ui";

/** Compact-width navigation: a disclosure that pushes content down and closes on navigation. */
export function MenuDisclosure({
  label,
  children,
  className,
  panelClassName,
  quiet = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  /** A full-width, borderless trigger for preferences inside a sidebar. */
  quiet?: boolean;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes whenever the route changes.
  useEffect(() => setExpanded(false), [pathname]);

  return (
    <Disclosure
      isExpanded={expanded}
      onExpandedChange={setExpanded}
      className={cx("contents", className)}
    >
      <Button
        slot="trigger"
        variant={quiet ? "tertiary" : "secondary"}
        className={quiet ? "w-full justify-between px-2.5 text-start text-text" : "px-3"}
      >
        {label}
        <icons.ChevronDownIcon
          className={cx("size-4 transition-transform", expanded && "rotate-180")}
        />
      </Button>
      <DisclosurePanel className={cx("order-last basis-full", panelClassName)}>
        {children}
      </DisclosurePanel>
    </Disclosure>
  );
}
