import { z } from "zod";
import { type ContentBlock, type ContentBody, contentParagraphs } from "@/domain/content-body";

export const maxContentBlocks = 30;
export const blockFields = z
  .object({
    type: z.enum(["", "paragraph", "heading", "step", "list", "callout", "link"]),
    title: z.string().max(200),
    text: z.string().max(5000),
    items: z.string().max(6030),
    href: z.string().max(400),
  })
  .strict();
export const compositionFields = z.array(blockFields).max(maxContentBlocks);
export type BlockFields = z.infer<typeof blockFields>;
export type ContentBodyValues = { text: string; bodyFormat: string; composition: string };
export const emptyBlock = (): BlockFields => ({
  type: "",
  title: "",
  text: "",
  items: "",
  href: "",
});

function editableBlock(block: ContentBlock): BlockFields {
  return {
    ...emptyBlock(),
    type: block.type,
    ...("title" in block ? { title: block.title } : {}),
    ...("text" in block ? { text: block.text } : {}),
    ...(block.type === "list" ? { items: block.items.join("\n") } : {}),
    ...(block.type === "link" ? { href: block.href } : {}),
  };
}
export function contentBodyValues(body: ContentBody | null): ContentBodyValues {
  if (!body) return { text: "", bodyFormat: "paragraphs", composition: "[]" };
  return {
    text: contentParagraphs(body).join("\n\n"),
    bodyFormat: "blocks" in body ? "blocks" : "paragraphs",
    composition: JSON.stringify(
      ("blocks" in body
        ? body.blocks
        : body.paragraphs.map((text) => ({ type: "paragraph" as const, text }))
      ).map(editableBlock),
    ),
  };
}
export function readEditableBlocks(value: string): BlockFields[] {
  try {
    const parsed = compositionFields.safeParse(JSON.parse(value || "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Named native inputs take precedence over a hidden snapshot, including before hydration. */
export function readCompositionFields(data: FormData, fallback: string): string {
  if (!data.has("bodyBlocks.0.type")) return fallback;
  const rows: BlockFields[] = [];
  for (let index = 0; index < maxContentBlocks; index += 1) {
    if (!data.has(`bodyBlocks.${index}.type`)) break;
    rows.push(
      Object.fromEntries(
        ["type", "title", "text", "items", "href"].map((key) => [
          key,
          String(data.get(`bodyBlocks.${index}.${key}`) ?? ""),
        ]),
      ) as BlockFields,
    );
  }
  // Fail closed on a forged extra slot rather than silently dropping its text.
  if (
    [...data.keys()].some(
      (key) => /^bodyBlocks\.(\d+)\./.test(key) && Number(key.split(".")[1]) >= maxContentBlocks,
    )
  )
    return JSON.stringify([...rows, ...Array.from({ length: maxContentBlocks + 1 }, emptyBlock)]);
  while (rows.at(-1)?.type === "") rows.pop();
  return JSON.stringify(rows);
}

export function blocksFromFields(rows: BlockFields[]): unknown[] {
  return rows
    .filter((row) => row.type !== "")
    .map((row) => {
      switch (row.type) {
        case "paragraph":
        case "heading":
          return { type: row.type, text: row.text };
        case "step":
        case "callout":
          return { type: row.type, title: row.title, text: row.text };
        case "list":
          return { type: row.type, items: row.items.split(/\r?\n/).filter((item) => item.trim()) };
        case "link":
          return { type: row.type, text: row.text, href: row.href };
        default:
          return null;
      }
    });
}
