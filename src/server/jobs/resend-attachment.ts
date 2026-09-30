// Retrieve exactly one human-selected attachment. Signed URLs and API credentials stay ephemeral.
import "server-only";
import { z } from "zod";
import { MAX_DOCUMENT_BYTES } from "../files/storage";

export interface ReceivedAttachment {
  emailId: string;
  id: string;
  fileName: string | null;
  contentType: string;
  bytes: Buffer;
}
export interface AttachmentProvider {
  readonly name: string;
  retrieveAttachment(emailId: string, attachmentId: string): Promise<ReceivedAttachment>;
}
const metadata = z.object({
  id: z.uuid(),
  filename: z.string().max(512).nullable(),
  content_type: z.string().min(1).max(160),
  size: z.int().positive().max(MAX_DOCUMENT_BYTES),
  download_url: z.string().max(8192),
  expires_at: z.iso.datetime({ offset: true }),
});
async function bounded(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Attachment response is empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (!response.ok || Number(response.headers.get("content-length")) > limit)
      throw new Error("Attachment response rejected");
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error("Attachment exceeds supported size");
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export class ResendAttachmentProvider implements AttachmentProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("Attachment provider not configured");
  }
  async retrieveAttachment(emailId: string, attachmentId: string): Promise<ReceivedAttachment> {
    z.uuid().parse(emailId);
    z.uuid().parse(attachmentId);
    // A single deadline covers both provider metadata and bytes, including streamed bodies.
    const signal = AbortSignal.timeout(30000);
    try {
      const response = await this.fetcher(
        `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
        {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          signal,
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        },
      );
      const value = metadata.parse(
        JSON.parse((await bounded(response, 64 * 1024)).toString("utf8")),
      );
      const url = new URL(value.download_url);
      if (
        value.id !== attachmentId ||
        new Date(value.expires_at).getTime() <= Date.now() ||
        url.origin !== "https://inbound-cdn.resend.com" ||
        url.username ||
        url.password ||
        url.hash ||
        url.pathname !== `/${emailId}/attachments/${attachmentId}`
      )
        throw new Error("Attachment metadata rejected");
      const download = await this.fetcher(url.href, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
        headers: { Accept: "application/octet-stream" },
      });
      const bytes = await bounded(download, Math.min(value.size, MAX_DOCUMENT_BYTES));
      if (bytes.length !== value.size) throw new Error("Attachment size mismatch");
      return {
        emailId,
        id: value.id,
        fileName: value.filename,
        contentType: value.content_type,
        bytes,
      };
    } catch {
      // Provider/network errors can contain signed URLs; never propagate them to logs or receipts.
      throw new Error("Attachment provider retrieval failed");
    }
  }
}
