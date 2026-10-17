// Server-to-server relay only. Cloudflare's EMAIL binding stays in the authenticated gateway.
import "server-only";
import { z } from "zod";
import type { HostOrigins } from "../config/hosts";
import type { MessageProvider, OutboundMessage, ProviderResult } from "./provider";
import { renderReviewedEmail } from "./resend";

type CloudflareEmailConfig = {
  relayUrl: string;
  relaySecret: string;
  accessClientId: string;
  accessClientSecret: string;
  from: string;
  hosts: HostOrigins;
};
const acceptedResponse = z
  .object({
    status: z.literal("accepted"),
    messageId: z.string().regex(/^[\x21-\x7e]{1,256}$/),
  })
  .strict();

export class CloudflareMessageProvider implements MessageProvider {
  readonly name = "cloudflare";
  private readonly config: CloudflareEmailConfig;

  constructor(
    config: CloudflareEmailConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    let relay: URL;
    try {
      relay = new URL(config.relayUrl);
      if (
        relay.protocol !== "https:" ||
        relay.username ||
        relay.password ||
        relay.search ||
        relay.hash ||
        relay.href !== new URL("/__staging/email", config.hosts.public).href
      )
        throw new Error();
    } catch {
      throw new Error("Invalid Cloudflare email configuration");
    }
    if (
      [config.relaySecret, config.accessClientId, config.accessClientSecret].some(
        (value) => !value || !/^[\x21-\x7e]+$/.test(value),
      ) ||
      !config.from.trim() ||
      /[\r\n]/.test(config.from)
    )
      throw new Error("Invalid Cloudflare email configuration");
    this.config = { ...config, relayUrl: relay.href, hosts: { ...config.hosts } };
  }

  async send(message: OutboundMessage): Promise<ProviderResult> {
    const email = renderReviewedEmail(message, this.config);
    if (!email || !/^[\x21-\x7e]{1,256}$/.test(message.idempotencyKey))
      return { status: "rejected", code: "unsupported_or_expired_message", retryable: false };
    // Never silently omit a reviewed calendar/document. The relay currently accepts plaintext only.
    if ("attachments" in email)
      return { status: "rejected", code: "unsupported_relay_attachment", retryable: false };
    const headers = new Headers({
      Authorization: `Bearer ${this.config.relaySecret}`,
      "Content-Type": "application/json",
      "CF-Access-Client-Id": this.config.accessClientId,
      "Idempotency-Key": message.idempotencyKey,
    });
    headers.set("CF-Access-Client-Secret", this.config.accessClientSecret);
    try {
      const response = await this.fetcher(this.config.relayUrl, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers,
        body: JSON.stringify({
          from: this.config.from,
          to: [message.recipient],
          subject: email.subject,
          text: email.text,
          ...("reply_to" in email ? { reply_to: email.reply_to } : {}),
        }),
      });
      // The relay contract guarantees these statuses precede EMAIL.send. None is auto-retried.
      if ([400, 405, 413, 422].includes(response.status))
        return {
          status: "rejected",
          code: `provider_rejected_${response.status}`,
          retryable: false,
        };
      if (response.status !== 200) throw new Error();
      const result = acceptedResponse.safeParse(await response.json());
      if (!result.success) throw new Error();
      return { status: "accepted", providerMessageId: result.data.messageId };
    } catch {
      // Includes pending/unknown/conflict 409s. No retry or diagnostics containing private content.
      throw new Error("Provider result needs reconciliation");
    }
  }
}
