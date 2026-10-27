"use client";

import type { ReactNode } from "react";
import { PublicNavLink } from "@/features/shell/public-nav-link";
import type { PublicLocale } from "@/i18n/config";
import { useSelection } from "./local-selection";

/** P08/P07: a persistent destination for the same ordered, device-local selection. */
export function SelectionLink({
  kind,
  locale,
  children,
  className,
}: {
  kind: "saved" | "compare";
  locale: PublicLocale;
  children: ReactNode;
  className?: string;
}) {
  const selection = useSelection(kind);
  const query =
    kind === "compare" && selection.hydrated && selection.refs.length
      ? `?${new URLSearchParams({ references: selection.refs.join(",") })}`
      : "";
  return (
    <PublicNavLink href={`/${locale}/${kind}${query}`} className={className}>
      {children}{" "}
      <span className="inline-flex min-w-7 justify-center rounded-control bg-subtle px-1 text-caption tabular-nums">
        {selection.hydrated ? selection.refs.length : <span aria-hidden="true">–</span>}
      </span>
    </PublicNavLink>
  );
}
