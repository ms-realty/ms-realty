// Fixed-origin, bounded provider reads. Received content and auth hints remain untrusted.
import "server-only";
import { z } from "zod";

const address = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\r\n]+$/);
const receivedEmail = z.object({
  id: z.uuid(),
  from: address,
  to: z.array(address).max(100),
  received_for: z.array(address).max(100).optional(),
  subject: z.string().max(1000),
  text: z.string().max(100000).nullable(),
  html: z.string().max(750000).nullable().optional(),
  created_at: z.iso.datetime({ offset: true }),
  authentication: z
    .object({
      spf: z.string().max(40).nullable().optional(),
      dkim: z.string().max(40).nullable().optional(),
      dmarc: z.string().max(40).nullable().optional(),
    })
    .optional(),
  attachments: z
    .array(
      z.object({
        id: z.uuid(),
        filename: z.string().max(512).nullable(),
        content_type: z.string().max(160),
        size: z.number().int().nonnegative().optional(),
      }),
    )
    .max(50),
});
export type ReceivedEmail = {
  id: string;
  from: string;
  senderAddress: string | null;
  recipients: string[];
  subject: string;
  text: string | null;
  receivedAt: string;
  htmlOmitted: boolean;
  authentication: Record<string, string | null | undefined>;
  attachments: {
    id: string;
    filename: string | null;
    contentType: string;
    size: number | null;
    state: "not_downloaded";
  }[];
};
export interface ReceivingProvider {
  readonly name: string;
  retrieve(id: string): Promise<ReceivedEmail>;
}
export class ResendReceivingProvider implements ReceivingProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("Receiving provider not configured");
  }
  async retrieve(id: string): Promise<ReceivedEmail> {
    if (!z.uuid().safeParse(id).success) throw new Error("Invalid received email identity");
    const response = await this.fetcher(`https://api.resend.com/emails/receiving/${id}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
    });
    if (!response.ok || !response.body) throw new Error("Receiving provider unavailable");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 1024 * 1024) {
          await reader.cancel();
          throw new Error("Received email exceeds supported size");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const email = receivedEmail.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (email.id !== id) throw new Error("Received email identity mismatch");
    return {
      id,
      from: email.from,
      senderAddress: z.email().safeParse(email.from).success ? email.from.toLowerCase() : null,
      recipients: [...new Set(email.received_for?.length ? email.received_for : email.to)],
      subject: email.subject,
      text: email.text,
      receivedAt: email.created_at,
      htmlOmitted: Boolean(email.html),
      authentication: email.authentication ?? {},
      attachments: email.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.content_type,
        size: a.size ?? null,
        state: "not_downloaded",
      })),
    };
  }
}
