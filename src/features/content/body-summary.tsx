import { contentBodyCopy } from "./body-copy";
import { readEditableBlocks } from "./body-fields";
import { ContentPlaintext } from "./plaintext";

/** O21 conflict comparison exposes ordered types and every draft string without active links. */
export function formatContentBodyValue(name: string, value: string, locale: string) {
  const copy = contentBodyCopy(locale);
  if (name === "bodyFormat") return value === "blocks" ? copy.blocks : copy.paragraphs;
  if (name !== "composition") return value;
  const rows = readEditableBlocks(value).filter((row) => row.type !== "");
  return rows.length ? (
    <ol className="list-decimal space-y-3 ps-5">
      {rows.map((row, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: ordered draft positions are the comparison subject
          key={index}
          className="min-w-0 space-y-1"
        >
          <strong>{row.type ? copy[row.type] : copy.empty}</strong>
          {(row.type === "step" || row.type === "callout"
            ? [row.title, row.text]
            : row.type === "list"
              ? [row.items]
              : row.type === "link"
                ? [row.text, row.href]
                : [row.text]
          ).map((text, part) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: immutable draft field order
              key={part}
              className="whitespace-pre-wrap break-words"
            >
              <ContentPlaintext text={text} />
            </p>
          ))}
        </li>
      ))}
    </ol>
  ) : (
    copy.empty
  );
}
