import type { ReactNode } from "react";

/** Preserve approved plaintext exactly while isolating LTR identities in RTL prose. */
export function ContentPlaintext({ text }: { text: string }) {
  const pieces: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+|MS-\d{5,}/g)) {
    const index = match.index;
    if (index > start) pieces.push(text.slice(start, index));
    pieces.push(
      <bdi
        key={index}
        dir="ltr"
        className={match[0].startsWith("MS-") ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}
      >
        {match[0]}
      </bdi>,
    );
    start = index + match[0].length;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return <>{pieces}</>;
}
