"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/ui";

/** A navigation link that marks itself as the current page. */
export function NavLink({
  href,
  children,
  className,
  exact = false,
}: {
  /** Must come from the navigation registry, which checks that the route exists. */
  href: string;
  children: ReactNode;
  className?: string;
  /** Match only this path, not its descendants (for section roots like /workspace). */
  exact?: boolean;
}) {
  const pathname = usePathname();
  const current = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href as Route}
      aria-current={current ? "page" : undefined}
      className={cx("group", className)}
      data-current={current || undefined}
    >
      {children}
    </Link>
  );
}
