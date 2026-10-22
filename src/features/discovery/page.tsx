import type { ReactNode } from "react";
export function DiscoveryPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-gutter py-8 lg:px-gutter-wide lg:py-12">
      {children}
    </div>
  );
}
export const discoveryMetadata = { robots: { index: false, follow: false } } as const;
