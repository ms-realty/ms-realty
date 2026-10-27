"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { cx } from "@/ui/cx";
import { navigationStartEvent } from "./navigation-loading-state";

/** P01/P02: purpose belongs to public navigation state; unrelated filters do not change it. */
export function publicNavigationCurrent(pathname: string, search: string, href: string) {
  const target = new URL(href, "https://public.invalid");
  if (target.searchParams.has("purpose")) {
    const query = new URLSearchParams(search);
    const purposes = query.getAll("purpose");
    if (purposes.length > 1) return false;
    const purpose = purposes[0] || "sale";
    return pathname === target.pathname && purpose === target.searchParams.get("purpose");
  }
  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}

type Props = { href: string; children: ReactNode; className?: string };
function CurrentPublicLink({ href, children, className }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = publicNavigationCurrent(pathname, search.toString(), href);
  return (
    <Link
      href={href}
      className={cx("group", className)}
      aria-current={current ? "page" : undefined}
      data-current={current || undefined}
      onNavigate={() =>
        window.dispatchEvent(new CustomEvent(navigationStartEvent, { detail: { href } }))
      }
    >
      {children}
    </Link>
  );
}

export function PublicNavLink(props: Props) {
  return (
    <Suspense
      fallback={
        <a href={props.href} className={props.className}>
          {props.children}
        </a>
      }
    >
      <CurrentPublicLink {...props} />
    </Suspense>
  );
}
