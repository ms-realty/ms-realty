"use client";

import { Breadcrumb, Breadcrumbs as RACBreadcrumbs } from "react-aria-components";
import { ChevronEndIcon } from "./icons";
import { Link } from "./link";

export type BreadcrumbItem = { id: string; label: string; href: string };

/** The last item is the current page. */
export function Breadcrumbs({ label, items }: { label: string; items: BreadcrumbItem[] }) {
  return (
    <nav aria-label={label}>
      <RACBreadcrumbs items={items} className="flex flex-wrap items-center gap-x-1 text-compact">
        {(item) => (
          <Breadcrumb id={item.id} className="flex items-center gap-1">
            {({ isCurrent }) => (
              <>
                <Link
                  href={item.href}
                  className="inline-flex min-h-control items-center data-current:font-semibold data-current:text-text data-current:no-underline"
                >
                  {item.label}
                </Link>
                {isCurrent ? null : (
                  <ChevronEndIcon directional className="size-4 text-text-muted" />
                )}
              </>
            )}
          </Breadcrumb>
        )}
      </RACBreadcrumbs>
    </nav>
  );
}
