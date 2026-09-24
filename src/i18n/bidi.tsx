// Mixed-direction isolation (spec §18.2, W3C "structural markup and RTL"). References,
// addresses, numbers, phone numbers and URLs keep their own direction inside RTL text.
import type { ReactNode } from "react";

/** Isolates content whose direction differs from, or is unknown relative to, its context. */
export function Isolate({
  children,
  dir = "auto",
}: {
  children: ReactNode;
  dir?: "ltr" | "rtl" | "auto";
}) {
  return <bdi dir={dir}>{children}</bdi>;
}

/** Always left-to-right: listing references, phone numbers, URLs, e-mail addresses. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

const FSI = "⁨";
const LRI = "⁦";
const PDI = "⁩";

/** Plain-text isolation for places markup cannot go: titles, attributes, message arguments. */
export function isolateText(text: string, dir: "ltr" | "auto" = "auto"): string {
  return `${dir === "ltr" ? LRI : FSI}${text}${PDI}`;
}
