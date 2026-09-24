import type { ReactNode } from "react";
import { cx } from "./cx";

/** A placeholder block where the structure is known. Invisible to assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-pulse rounded-control bg-subtle motion-reduce:animate-none forced-colors:border",
        className,
      )}
    />
  );
}

/**
 * Wraps skeletons for one region. It says once, in text, what is loading instead of
 * letting every placeholder be announced.
 */
export function SkeletonRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
