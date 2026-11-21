// How a listing description is laid out: one paragraph per existing line break, and a phone-width
// estimate of its length. The recorded text is never changed.

/** Where a description starts to collapse on phones, in lines of about 38 characters. */
export const collapseAboveLines = 12;
const charactersPerLine = 38;

/** The recorded description, one paragraph per existing line break; the text is untouched. */
export function descriptionParagraphs(description: string | null | undefined) {
  return (description ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A phone-width estimate of the lines the paragraphs take, with one line between them. */
export function estimatedLines(paragraphs: readonly string[]) {
  return (
    paragraphs.reduce((sum, part) => sum + Math.ceil(part.length / charactersPerLine), 0) +
    Math.max(paragraphs.length - 1, 0)
  );
}
