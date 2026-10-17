"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Keep skip links and focused/error targets below the header even when its menu wraps. */
export function StickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty(
        "--public-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--public-header-height");
    };
  }, []);
  return (
    <header
      ref={ref}
      data-public-header=""
      className="sticky top-[env(safe-area-inset-top)] z-(--z-header) border-b border-divider bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/85"
    >
      {children}
    </header>
  );
}
