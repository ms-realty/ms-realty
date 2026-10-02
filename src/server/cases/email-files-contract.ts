import "server-only";
import { z } from "zod";

export const maxEmailFileBytes = 10 * 1024 * 1024;
export const emailFile = z
  .object({
    kind: z.literal("document"),
    documentId: z.uuid(),
    versionId: z.uuid(),
    requestId: z.uuid(),
    recipientId: z.uuid(),
    versionNumber: z.int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine((value) =>
        [...value].every(
          (char) =>
            char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && char !== "/" && char !== "\\",
        ),
      ),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    byteSize: z.int().positive().max(maxEmailFileBytes),
  })
  .strict();
export const emailFiles = emailFile
  .array()
  .max(5)
  .refine(
    (files) =>
      new Set(files.map((file) => file.versionId)).size === files.length &&
      files.reduce((total, file) => total + file.byteSize, 0) <= maxEmailFileBytes,
  );
export type EmailFile = z.infer<typeof emailFile>;
