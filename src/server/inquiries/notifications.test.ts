import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../jobs/provider";
import { ResendMessageProvider } from "../jobs/resend";
import { inquiryCoverageNoticeConfig, inquiryCoverageNoticeKey } from "./notifications";

const config = {
  apiKey: "test",
  from: "MS Realty <staging@example.test>",
  hosts: {
    public: "https://staging.example.test",
    client: "https://client-staging.example.test",
    staff: "https://staff-staging.example.test",
  },
};
beforeEach(() => {
  vi.stubEnv("STAGING", "true");
  vi.stubEnv("INQUIRY_COVERAGE_NOTICE_ENABLED", "1");
  vi.stubEnv("INQUIRY_COVERAGE_TEST_INBOX_REVIEWED", "true");
  vi.stubEnv("INQUIRY_COVERAGE_TEST_INBOX", "reviewed-test-inbox@example.test");
  vi.stubEnv("STAFF_ORIGIN", config.hosts.staff);
});
afterEach(() => vi.unstubAllEnvs());
const message = (): OutboundMessage => {
  const eventId = randomUUID();
  return {
    outboxId: randomUUID(),
    idempotencyKey: inquiryCoverageNoticeKey(eventId),
    channel: "email",
    recipient: "reviewed-test-inbox@example.test",
    template: "inquiry.coverage-notice.v1",
    params: {
      eventId,
      inquiryId: randomUUID(),
      reference: "RQ-2026-000001",
      coverageQueue: "intake",
      queueUrl: "https://staff-staging.example.test/bg/inquiries",
    },
    secretParams: null,
  };
};

describe("strict staging inquiry template", () => {
  it("renders identifiers and the canonical staff queue into one plaintext request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: randomUUID() }), { status: 200 }));
    const input = message();
    expect((await new ResendMessageProvider(config, fetcher).send(input)).status).toBe("accepted");
    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(payload.to).toEqual(["reviewed-test-inbox@example.test"]);
    expect(payload.text).toBe(
      `MS Realty staging\n\nRQ-2026-000001\n${input.params.inquiryId}\n${input.params.eventId}\nintake\n\nhttps://staff-staging.example.test/bg/inquiries`,
    );
    expect(payload.html).toBeUndefined();
    expect(payload.attachments).toBeUndefined();
    expect(payload.reply_to).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses customer recipients, arbitrary content, links, secrets and attachments", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ResendMessageProvider(config, fetcher);
    const input = message();
    for (const change of [
      { recipient: "customer@example.test" },
      { params: { ...input.params, body: "private message" } },
      { params: { ...input.params, queueUrl: "https://foreign.example.test/bg/inquiries" } },
      { params: { ...input.params, queueUrl: `${input.params.queueUrl}?recipient=customer` } },
      { params: { ...input.params, queueUrl: `${input.params.queueUrl}#private` } },
      { params: { ...input.params, reference: "RQ-2026-000001\r\nheader" } },
      { secretParams: { url: "private capability" } },
      { files: [] },
      { idempotencyKey: randomUUID() },
    ])
      expect((await provider.send({ ...input, ...change })).status).toBe("rejected");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["STAGING", "false"],
    ["STAGING", "TRUE"],
    ["INQUIRY_COVERAGE_TEST_INBOX_REVIEWED", ""],
    ["INQUIRY_COVERAGE_TEST_INBOX", "a@example.test,b@example.test"],
    ["STAFF_ORIGIN", "http://staff-staging.example.test"],
    ["STAFF_ORIGIN", "https://staff-staging.example.test/"],
  ])("configuration %s=%s cannot render or send", async (key, value) => {
    vi.stubEnv(key, value);
    expect(inquiryCoverageNoticeConfig()).toBeNull();
    const fetcher = vi.fn<typeof fetch>();
    expect((await new ResendMessageProvider(config, fetcher).send(message())).status).toBe(
      "rejected",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("the provider's staff origin must agree with the reviewed configuration", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ResendMessageProvider(
      { ...config, hosts: { ...config.hosts, staff: "https://other.example.test" } },
      fetcher,
    );
    expect((await provider.send(message())).status).toBe("rejected");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
