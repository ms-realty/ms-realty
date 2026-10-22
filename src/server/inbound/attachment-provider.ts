import "server-only";
import { z } from "zod";
import { getEnv, type ServerEnv } from "../config/env";
import { AppError } from "../errors";
import type { FileStorage } from "../files/storage";
import { MAX_DOCUMENT_BYTES } from "../files/storage";
import { type AttachmentProvider, ResendAttachmentProvider } from "../jobs/resend-attachment";

export function attachmentProviderEnabled(
  provider: string,
  source: Record<string, string | undefined> = process.env,
  env: ServerEnv = getEnv(),
) {
  if (provider === "test") return env.testOutbox;
  return (
    provider === "resend" &&
    source.CASE_INBOUND_ENABLED === "1" &&
    source.MAIL_PROVIDER === "resend" &&
    Boolean(source.RESEND_API_KEY?.trim())
  );
}
export function configuredAttachmentProvider(
  provider: string,
  storage: FileStorage,
  source: Record<string, string | undefined> = process.env,
  env: ServerEnv = getEnv(),
): AttachmentProvider {
  if (!attachmentProviderEnabled(provider, source, env)) throw new AppError("unavailable");
  if (provider === "resend") return new ResendAttachmentProvider(source.RESEND_API_KEY as string);
  // Explicit loopback-only test-outbox adapter. It reads isolated synthetic files; never a URL.
  return {
    name: "test",
    async retrieveAttachment(emailId, attachmentId) {
      z.uuid().parse(emailId);
      z.uuid().parse(attachmentId);
      const bytes = await storage.read(
        `staging/test-inbound/${emailId}/${attachmentId}`,
        MAX_DOCUMENT_BYTES,
      );
      return {
        emailId,
        id: attachmentId,
        fileName: "synthetic-inbound.pdf",
        contentType: "application/pdf",
        bytes,
      };
    },
  };
}
