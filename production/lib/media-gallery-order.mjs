import { createHash } from "node:crypto";

// Bind an editor's order to the whole gallery, including relations whose
// media are outside the visible grid. Preserve repeated relations in the hash.
export function mediaGalleryRevision(relations = []) {
  const ids = relations.map((entry) => String(entry && typeof entry === "object" ? entry.id : entry));
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}
