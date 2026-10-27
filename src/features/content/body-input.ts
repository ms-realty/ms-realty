import { contentBlocks } from "@/domain/content-body";
import { AppError } from "@/server/errors";
import { blocksFromFields, type ContentBodyValues, compositionFields } from "./body-fields";

/** O21: one explicit authoring mode; typed drafts never fall back to flattened paragraphs. */
export function contentDraftInput(values: ContentBodyValues) {
  if (!values.bodyFormat || values.bodyFormat === "paragraphs") return { text: values.text };
  if (values.bodyFormat === "blocks") {
    try {
      const rows = compositionFields.parse(JSON.parse(values.composition));
      return { blocks: contentBlocks.parse(blocksFromFields(rows)), text: undefined };
    } catch {
      throw new AppError("validation_failed", {
        fieldErrors: { composition: ["invalid_composition"] },
      });
    }
  }
  throw new AppError("validation_failed", { fieldErrors: { bodyFormat: ["invalid_composition"] } });
}
