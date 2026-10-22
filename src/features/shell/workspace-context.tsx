"use client";

import { usePathname } from "next/navigation";

/** Section identity uses the same native destinations as the rail, including nested records. */
export function WorkspaceContext({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const current = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return (
    <p className="min-w-0 text-dense text-text-muted wrap-anywhere">
      {label}
      {current ? <> / {current.label}</> : null}
    </p>
  );
}
