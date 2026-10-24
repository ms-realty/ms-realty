"use client";

import { usePathname } from "next/navigation";
import { ChevronEndIcon } from "@/ui/icons";

/** Section identity uses the same native destinations as the rail, including nested records. */
export function WorkspaceContext({
  label,
  navigationLabel = label,
  items,
}: {
  label: string;
  navigationLabel?: string;
  items: readonly { href: string; label: string; matchPath?: string }[];
}) {
  const pathname = usePathname();
  const familyPath = (item: (typeof items)[number]) =>
    item.matchPath ?? item.href.split("?")[0] ?? item.href;
  const current = [...items]
    .sort((a, b) => familyPath(b).length - familyPath(a).length)
    .find((item) => pathname === familyPath(item) || pathname.startsWith(`${familyPath(item)}/`));
  return (
    <nav aria-label={navigationLabel} className="min-w-0 text-dense text-text-muted">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <a
            href={`/${pathname.split("/")[1]}/today`}
            className="inline-flex min-h-control items-center rounded-control hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {label}
          </a>
        </li>
        {current ? (
          <li className="flex min-w-0 items-center gap-2">
            <ChevronEndIcon directional className="size-4" />
            {pathname === current.href.split("?")[0] || pathname === current.matchPath ? (
              <span aria-current="page" className="font-medium text-text">
                {current.label}
              </span>
            ) : (
              <a
                className="inline-flex min-h-control items-center rounded-control font-medium text-text hover:underline"
                href={current.href}
              >
                {current.label}
              </a>
            )}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
