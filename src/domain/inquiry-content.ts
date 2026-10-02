import { z } from "zod";

/** Public CMS identity only: titles and links are loaded from current approved content. */
export const contentReferenceSchema = z
  .object({
    kind: z.enum(["area", "service", "help"]),
    slug: z.string().regex(/^[a-z\d][a-z\d-]{0,100}$/),
    versionId: z.uuid(),
  })
  .strict();
export type ContentReference = z.infer<typeof contentReferenceSchema>;

export function parseContentReference(value: string): ContentReference | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = contentReferenceSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function contentRoute({ kind, slug }: Pick<ContentReference, "kind" | "slug">) {
  if (kind === "service" && (slug === "sell" || slug === "let")) return `/${slug}`;
  if (kind === "help" && slug === "contact") return "/contact";
  return `/${kind === "area" ? "areas" : kind === "service" ? "services" : "help"}/${slug}`;
}
