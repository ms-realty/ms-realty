import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type RelayEnv, type RelayStore, relayEmail } from "../../../gateway/email-relay";
import { CloudflareMessageProvider } from "./cloudflare-email";
import type { OutboundMessage } from "./provider";

const config = {
  relayUrl: "https://example.test/__staging/email",
  relaySecret: "unit-relay",
  accessClientId: "unit-id",
  accessClientSecret: "unit-access",
  from: "MS Realty <access@example.test>",
  hosts: {
    public: "https://example.test",
    client: "https://my.example.test",
    staff: "https://app.example.test",
  },
};
const message = (): OutboundMessage => ({
  outboxId: randomUUID(),
  idempotencyKey: `email:${randomUUID()}`,
  channel: "email",
  recipient: "recipient@example.test",
  template: "auth.email_link",
  params: { locale: "bg", expiresAt: "2099-01-01T00:00:00.000Z" },
  secretParams: { url: "https://my.example.test/bg/access/confirm?token=synthetic" },
});
const accepted = () =>
  new Response(JSON.stringify({ status: "accepted", messageId: "stable-provider-message" }));

afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare email relay boundary", () => {
  it("sends one authenticated plaintext request using the immutable outbox key", async () => {
    const input = message();
    const before = structuredClone(input);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => accepted());
    const provider = new CloudflareMessageProvider(config, fetcher);
    expect(await provider.send(input)).toEqual({
      status: "accepted",
      providerMessageId: "stable-provider-message",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://example.test/__staging/email");
    expect(options?.method).toBe("POST");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(new Headers(options?.headers))).toEqual({
      authorization: "Bearer unit-relay",
      "content-type": "application/json",
      "cf-access-client-id": "unit-id",
      "cf-access-client-secret": "unit-access",
      "idempotency-key": input.idempotencyKey,
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      from: config.from,
      to: [input.recipient],
      subject: "Вход в MS Realty",
      text: "MS Realty\n\nОтворете връзката, за да продължите. Не я препращайте. Ако не очаквате това писмо, можете да го игнорирате.\n\nhttps://my.example.test/bg/access/confirm?token=synthetic\n\n2099-01-01T00:00:00.000Z (UTC)",
    });
    expect(input).toEqual(before);
    // Persisted relay state, not this adapter, decides whether a later call can send.
    await provider.send(input);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(options?.body);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual(options?.headers);
  });

  it.each([
    "http://example.test/__staging/email",
    "https://foreign.example.test/__staging/email",
    "https://example.test/other",
    "https://example.test/__staging/email?recipient=other",
    "https://example.test/__staging/email#fragment",
    "https://user:password@example.test/__staging/email",
    "http://localhost:3000/__staging/email",
    "not-a-url",
  ])("rejects an unapproved relay URL before network: %s", (relayUrl) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => new CloudflareMessageProvider({ ...config, relayUrl }, fetcher)).toThrow(
      "Invalid Cloudflare email configuration",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["relaySecret", "accessClientId", "accessClientSecret", "from"] as const)(
    "requires header-safe %s configuration without echoing its value",
    (field) => {
      for (const value of ["", " \t", "sensitive\r\nInjected: value"]) {
        expect(() => new CloudflareMessageProvider({ ...config, [field]: value })).toThrow(
          /^Invalid Cloudflare email configuration$/,
        );
      }
    },
  );

  it("snapshots validated configuration instead of permitting later relay substitution", async () => {
    const mutable = { ...config, hosts: { ...config.hosts } };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => accepted());
    const provider = new CloudflareMessageProvider(mutable, fetcher);
    mutable.relayUrl = "https://foreign.example.test/steal";
    mutable.hosts.client = "https://foreign.example.test";
    expect((await provider.send(message())).status).toBe("accepted");
    expect(fetcher.mock.calls[0]?.[0]).toBe(config.relayUrl);
  });

  it("refuses arbitrary templates, foreign/expired links and unsafe idempotency keys", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new CloudflareMessageProvider(config, fetcher);
    const input = message();
    const invalid: OutboundMessage[] = [
      { ...input, template: "customer.reply", params: { subject: "Unreviewed", body: "Send" } },
      { ...input, channel: "phone" },
      { ...input, secretParams: { url: "https://foreign.example.test/bg/access/confirm" } },
      { ...input, params: { ...input.params, expiresAt: "2020-01-01T00:00:00.000Z" } },
      ...["", "a".repeat(257), "key\r\nInjected: value", "non-ascii-ключ"].map(
        (idempotencyKey) => ({ ...input, idempotencyKey }),
      ),
    ];
    for (const item of invalid)
      expect(await provider.send(item)).toEqual({
        status: "rejected",
        code: "unsupported_or_expired_message",
        retryable: false,
      });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts the relay's 256-byte idempotency limit without substituting the outbox id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => accepted());
    const input = { ...message(), idempotencyKey: "a".repeat(256) };
    expect((await new CloudflareMessageProvider(config, fetcher).send(input)).status).toBe(
      "accepted",
    );
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe(
      input.idempotencyKey,
    );
  });

  it.each([400, 405, 413, 422])(
    "records definite pre-send rejection %s without retry",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: "message_not_allowed" }), { status }),
        );
      expect(await new CloudflareMessageProvider(config, fetcher).send(message())).toEqual({
        status: "rejected",
        code: `provider_rejected_${status}`,
        retryable: false,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [409, { status: "pending" }],
    [409, { status: "unknown" }],
    [409, { code: "idempotency_conflict" }],
    [500, {}],
    [429, {}],
    [200, { status: "delivered", messageId: "wrong-state" }],
    [200, { status: "accepted" }],
    [200, { status: "accepted", messageId: "" }],
    [200, { status: "accepted", messageId: "unsafe\u0000id" }],
    [202, { status: "accepted", messageId: "uncontracted-status" }],
  ])("parks ambiguous response %s %j with exactly one call", async (status, body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
    await expect(new CloudflareMessageProvider(config, fetcher).send(message())).rejects.toThrow(
      "reconciliation",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("parks a dropped response or invalid JSON without exposing request secrets or retrying", async () => {
    for (const fetcher of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive network diagnostics")),
      vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON")),
    ]) {
      await expect(new CloudflareMessageProvider(config, fetcher).send(message())).rejects.toThrow(
        /^Provider result needs reconciliation$/,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});

it("preserves reviewed Case content and reply address, rejecting attachments before relay", async () => {
  vi.stubEnv("CASE_EMAIL_ENABLED", "1");
  vi.stubEnv("CASE_REPLY_DOMAIN", "reply.example.test");
  vi.stubEnv("EMAIL_FROM", config.from);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => accepted());
  const input: OutboundMessage = {
    ...message(),
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
  const provider = new CloudflareMessageProvider(config, fetcher);
  for (const invalid of [
    { ...input, recipient: "other@example.test" },
    { ...input, params: { ...input.params, from: "other@example.test" } },
    { ...input, params: { ...input.params, replyTo: "other@reply.example.test" } },
  ])
    expect((await provider.send(invalid)).status).toBe("rejected");
  expect(fetcher).not.toHaveBeenCalled();
  expect((await provider.send(input)).status).toBe("accepted");
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
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
  expect(await provider.send({ ...input, params: { ...input.params, calendar } })).toEqual({
    status: "rejected",
    code: "unsupported_relay_attachment",
    retryable: false,
  });
  const bytes = new TextEncoder().encode("synthetic document");
  const versionId = randomUUID();
  expect(
    await provider.send({
      ...input,
      params: {
        ...input.params,
        documents: [
          {
            kind: "document",
            documentId: randomUUID(),
            versionId,
            requestId: randomUUID(),
            recipientId: randomUUID(),
            versionNumber: 1,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            fileName: "reviewed.pdf",
            contentType: "application/pdf",
            byteSize: bytes.length,
          },
        ],
      },
      files: [{ versionId, bytes }],
    }),
  ).toEqual({ status: "rejected", code: "unsupported_relay_attachment", retryable: false });
  vi.stubEnv("CASE_EMAIL_ENABLED", "");
  expect((await provider.send(input)).status).toBe("rejected");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("renders the fixed saved-search digest with exact approved destinations", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => accepted());
  const digest = {
    schemaVersion: 1,
    subscriptionVersion: 1,
    ruleApprovalId: randomUUID(),
    ruleHash: "a".repeat(64),
    contactMethodId: randomUUID(),
    contactVersion: 1,
    policyVersion: "synthetic",
    templateVersion: "search-alerts.v1",
    criteriaSnapshot: {},
    criteriaHash: "b".repeat(64),
    locale: "bg",
    timezone: "Europe/Sofia",
    frequency: "daily",
    period: "day:2026-10-01",
    plannedAt: "2026-10-01T00:00:00.000Z",
    preferencesUrl: "https://my.example.test/bg/preferences",
    scanIncomplete: false,
    items: [
      {
        listingId: randomUUID(),
        listingRevisionId: randomUUID(),
        manifestId: randomUUID(),
        reference: "MS-001",
        title: "Source title",
        sourceUrl: "https://example.test/bg/properties/MS-001/ms-001",
        match: "needs_confirmation",
        unconfirmed: ["bedrooms"],
      },
    ],
  };
  const input = {
    ...message(),
    template: "search_alerts.digest.v1",
    secretParams: null,
    params: { digest },
  };
  const provider = new CloudflareMessageProvider(config, fetcher);
  expect((await provider.send(input)).status).toBe("accepted");
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    from: config.from,
    to: [input.recipient],
    subject: "Обновления по запазеното търсене",
    text: "Прегледайте актуалните данни в обявата.\n\nMS-001 — Source title\nНякои критерии изискват потвърждение.\nhttps://example.test/bg/properties/MS-001/ms-001\n\nУправление, пауза или отказ от известия:\nhttps://my.example.test/bg/preferences",
  });
  expect(
    (
      await provider.send({
        ...input,
        params: {
          digest: { ...digest, preferencesUrl: "https://foreign.example.test/preferences" },
        },
      })
    ).status,
  ).toBe("rejected");
  expect(
    (
      await provider.send({
        ...input,
        params: {
          digest: {
            ...digest,
            items: digest.items.map((item) => ({
              ...item,
              sourceUrl: "https://foreign.example.test/listing",
            })),
          },
        },
      })
    ).status,
  ).toBe("rejected");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

describe("adapter and persisted gateway relay contract", () => {
  const setup = () => {
    const data = new Map<string, unknown>();
    const store: RelayStore = {
      async get<T>(key: string) {
        return data.get(key) as T | undefined;
      },
      async put(key, value) {
        data.set(key, value);
      },
    };
    const send = vi.fn<RelayEnv["EMAIL"]["send"]>().mockResolvedValue({
      messageId: "persisted-binding-receipt",
    });
    const env: RelayEnv = {
      EMAIL_FROM: config.from,
      EMAIL_ALLOWED_RECIPIENTS: JSON.stringify(["recipient@example.test"]),
      EMAIL: { send },
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) =>
      // This exercises body/receipt semantics locally. Cloudflare Access is covered
      // by the gateway's separate authorization tests, not bypassed as live evidence.
      relayEmail(new Request(url, options), env, store),
    );
    return { provider: new CloudflareMessageProvider(config, fetcher), send, data, fetcher };
  };

  it("returns stable acceptance for duplicate bytes and parks a conflicting body without resending", async () => {
    const { provider, send, data } = setup();
    const input = message();
    const expected = { status: "accepted", providerMessageId: "persisted-binding-receipt" };
    expect(await provider.send(input)).toEqual(expected);
    expect(await provider.send(input)).toEqual(expected);
    expect(send).toHaveBeenCalledTimes(1);
    expect(data.get("receipt")).toMatchObject({
      status: "accepted",
      messageId: "persisted-binding-receipt",
    });
    await expect(
      provider.send({
        ...input,
        params: { ...input.params, locale: "en" },
        secretParams: {
          url: "https://my.example.test/en/access/confirm?token=synthetic",
        },
      }),
    ).rejects.toThrow("reconciliation");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("preserves unknown receipt state after binding failure and never sends a duplicate", async () => {
    const { provider, send, data } = setup();
    send.mockRejectedValue(new Error("synthetic dropped binding result"));
    const input = message();
    await expect(provider.send(input)).rejects.toThrow("reconciliation");
    expect(data.get("receipt")).toMatchObject({ status: "unknown" });
    await expect(provider.send(input)).rejects.toThrow("reconciliation");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports allowlist denial as definite rejection without a receipt or binding call", async () => {
    const { provider, send, data } = setup();
    expect(await provider.send({ ...message(), recipient: "outside@example.test" })).toEqual({
      status: "rejected",
      code: "provider_rejected_422",
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });
});
