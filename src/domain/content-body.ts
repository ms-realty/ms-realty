import { z } from "zod";

const text = z.string().trim().min(1).max(5000);
const shortText = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value));
const placeId = z
  .uuid()
  .transform((value) => value.toLowerCase())
  .nullable()
  .optional();

/** P15/P16: authored links can only navigate to known public pages, never files or staff work. */
export function isContentLink(value: string) {
  if (/[\\%?#\s]/.test(value) || [...value].some((character) => character.charCodeAt(0) < 32))
    return false;
  return /^\/(bg|en|ru|de|nl|el|he)(?:\/(?:contact|sell|let|areas|properties|inquire|saved|compare|search-alerts)|\/(?:areas|services|help|reviews)\/[a-z\d][a-z\d-]{0,100}|\/properties\/MS-\d{5,}\/[a-z\d][a-z\d-]{0,100})?$/.test(
    value,
  );
}

export const contentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z.object({ type: z.literal("heading"), text: shortText }).strict(),
  z.object({ type: z.literal("step"), title: shortText, text }).strict(),
  z.object({ type: z.literal("list"), items: z.array(shortText).min(1).max(30) }).strict(),
  z.object({ type: z.literal("callout"), title: shortText, text }).strict(),
  z
    .object({
      type: z.literal("link"),
      text: shortText,
      href: z.string().max(400).refine(isContentLink),
    })
    .strict(),
]);
export type ContentBlock = z.infer<typeof contentBlock>;

function blockParagraphs(block: ContentBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [block.text];
    case "step":
    case "callout":
      return [block.title, block.text];
    case "list":
      return block.items;
    case "link":
      return [block.text, block.href];
  }
}
export const contentBlocks = z
  .array(contentBlock)
  .min(1)
  .max(30)
  .refine((blocks) => blocks.flatMap(blockParagraphs).join("\n\n").length <= 50000);

// Preserve the historical shape and parsing. Existing immutable versions are never rewritten.
const legacyBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    paragraphs: z.array(text).min(1).max(30),
    placeId,
  })
  .strict();
const blockBody = z
  .object({
    format: z.literal("blocks"),
    title: z.string().trim().min(1).max(200),
    blocks: contentBlocks,
    placeId,
  })
  .strict();
export const contentBody = z.union([legacyBody, blockBody]);
export type ContentBody = z.infer<typeof contentBody>;

/** Ordered, complete plaintext for consent, legal, email and metadata readers. */
export function contentParagraphs(body: ContentBody): string[] {
  return "blocks" in body ? body.blocks.flatMap(blockParagraphs) : body.paragraphs;
}
