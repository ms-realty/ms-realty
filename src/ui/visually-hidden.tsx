import type { ReactNode } from "react";

/** Text for assistive technology only. Never hide information sighted users also need. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
