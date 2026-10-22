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

it("renders only the reviewed Case sender, recipient and opaque reply address", async () => {
  vi.stubEnv("CASE_EMAIL_ENABLED", "1");
  vi.stubEnv("CASE_REPLY_DOMAIN", "reply.example.test");
  vi.stubEnv("EMAIL_FROM", config.from);
  try {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: randomUUID() }), { status: 200 }),
      );
    const input: OutboundMessage = {
      outboxId: randomUUID(),
      idempotencyKey: randomUUID(),
      channel: "email",
      recipient: "recipient@example.test",
      template: "case.reviewed-email.v1",
      secretParams: null,
      params: {
        messageId: randomUUID(),
        caseId: randomUUID(),
        subject: "Reviewed subject",
        body: "Literal text <script> is not HTML",
        from: config.from,
        replyTo: `m-${"a".repeat(40)}@reply.example.test`,
        recipient: {
          subscriptionId: randomUUID(),
          subscriptionVersion: 1,
          partyId: randomUUID(),
          contactId: randomUUID(),
          contactVersion: 1,
          address: "recipient@example.test",
          policyVersion: "synthetic",
        },
      },
    };
    const provider = new ResendMessageProvider(config, fetcher);
    expect((await provider.send({ ...input, recipient: "different@example.test" })).status).toBe(
      "rejected",
    );
    expect(
      (await provider.send({ ...input, params: { ...input.params, from: "changed@example.test" } }))
        .status,
    ).toBe("rejected");
    expect(
      (
        await provider.send({
          ...input,
          params: { ...input.params, replyTo: "arbitrary@reply.example.test" },
        })
      ).status,
    ).toBe("rejected");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await provider.send(input)).status).toBe("accepted");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      from: config.from,
      to: [input.recipient],
      subject: input.params.subject,
      text: input.params.body,
      reply_to: input.params.replyTo,
    });
    const calendar = {
      kind: "appointment_calendar",
      appointmentId: randomUUID(),
      appointmentVersion: 1,
      caseId: input.params.caseId,
      reference: "AP-test",
      uid: "stable@appointments.example.test",
      sequence: 1,
      startsAt: "2027-01-15T08:00:00.000Z",
      endsAt: "2027-01-15T09:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
      cancelled: false,
      organizer: "access@example.test",
    };
    expect((await provider.send({ ...input, params: { ...input.params, calendar } })).status).toBe(
      "accepted",
    );
    const payload = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0]).toMatchObject({
      filename: "appointment.ics",
      content_type: "text/calendar; charset=utf-8; method=REQUEST",
    });
    expect(payload.attachments[0].path).toBeUndefined();
    expect(Buffer.from(payload.attachments[0].content, "base64").toString()).toContain(
      "UID:stable@appointments.example.test\r\n",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://api.resend.com/emails");
    vi.stubEnv("CASE_EMAIL_ENABLED", "");
    expect((await provider.send(input)).status).toBe("rejected");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllEnvs();
  }
});
