import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "./provider";
import { ResendMessageProvider } from "./resend";

const config = {
  apiKey: "synthetic-no-network-key",
  from: "MS Realty <access@example.test>",
  hosts: {
    public: "https://example.test",
    client: "https://my.example.test",
    staff: "https://app.example.test",
  },
};
const message = (): OutboundMessage => ({
  outboxId: randomUUID(),
  idempotencyKey: randomUUID(),
  channel: "email",
  recipient: "recipient@example.test",
  template: "auth.email_link",
  params: { locale: "bg", expiresAt: new Date(Date.now() + 60_000).toISOString() },
  secretParams: { url: "https://my.example.test/bg/access/confirm?token=synthetic" },
});
describe("Resend boundary", () => {
  it("sends one fixed-host, idempotent, plaintext request and records only provider acceptance", async () => {
    const id = randomUUID(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
    const input = message();
    expect(await new ResendMessageProvider(config, fetcher).send(input)).toEqual({
      status: "accepted",
      providerMessageId: id,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.headers).toMatchObject({ "Idempotency-Key": input.idempotencyKey });
    const payload = JSON.parse(String(options?.body));
    expect(payload.to).toEqual([input.recipient]);
    expect(payload.text).toContain(input.secretParams?.url);
    expect(payload.html).toBeUndefined();
  });
  it.each(["customer.reply", "auth.email_link"])(
    "refuses arbitrary templates, foreign links and expired auth links before a provider call (%s)",
    async (template) => {
      const fetcher = vi.fn<typeof fetch>();
      const provider = new ResendMessageProvider(config, fetcher);
      const result = await provider.send({
        ...message(),
        template,
        secretParams: { url: "https://evil.example/bg/access/confirm" },
      });
      expect(result).toMatchObject({ status: "rejected", retryable: false });
      const expired = message();
      expect(
        await provider.send({
          ...expired,
          params: { ...expired.params, expiresAt: "2020-01-01T00:00:00.000Z" },
        }),
      ).toMatchObject({ status: "rejected" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("only retries definite throttling, and leaves timeouts/5xx/conflicts ambiguous", async () => {
    for (const status of [429, 422, 500, 409]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
      const result = new ResendMessageProvider(config, fetcher).send(message());
      if (status === 429)
        expect(await result).toMatchObject({ status: "rejected", retryable: true });
      else if (status === 422)
        expect(await result).toMatchObject({ status: "rejected", retryable: false });
      else await expect(result).rejects.toThrow("reconciliation");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
