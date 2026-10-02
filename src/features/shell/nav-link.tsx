"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/ui/cx";

/** A navigation link that marks itself as the current page. */
export function NavLink({
  href,
  children,
  className,
  exact = false,
  excludePaths = [],
}: {
  /** Must come from the navigation registry, which checks that the route exists. */
  href: string;
  children: ReactNode;
  className?: string;
  /** Match only this path, not its descendants (for section roots). */
  exact?: boolean;
  /** A separately navigable child section owns its own active item. */
  excludePaths?: readonly string[];
}) {
  const pathname = usePathname();
  const excluded = excludePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const current = !excluded && (pathname === href || (!exact && pathname.startsWith(`${href}/`)));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cx("group", className)}
      data-current={current || undefined}
    >
      {children}
    </Link>
  );
}
