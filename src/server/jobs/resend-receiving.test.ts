import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ResendReceivingProvider } from "./resend-receiving";

const id = randomUUID();
const response = () => ({
  id,
  from: "sender@example.test",
  to: ["public@example.test"],
  received_for: ["reply@example.test"],
  subject: "Untrusted",
  text: "Plain text",
  html: '<img src="https://private.example.test/secret">',
  created_at: new Date().toISOString(),
  authentication: { spf: "fail" },
  raw: { download_url: "https://private.example.test/raw" },
  attachments: [
    {
      id: randomUUID(),
      filename: "untrusted.pdf",
      content_type: "application/pdf",
      download_url: "https://private.example.test/file",
    },
  ],
});
it("uses one bounded fixed-origin read and omits HTML, raw material and attachment URLs", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response()));
  const mail = await new ResendReceivingProvider("synthetic", fetcher).retrieve(id);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    `https://api.resend.com/emails/receiving/${id}`,
    expect.objectContaining({ method: "GET", redirect: "error", signal: expect.any(AbortSignal) }),
  );
  expect(mail).toMatchObject({
    text: "Plain text",
    htmlOmitted: true,
    recipients: ["reply@example.test"],
    authentication: { spf: "fail" },
    attachments: [{ state: "not_downloaded" }],
  });
  expect(JSON.stringify(mail)).not.toContain("private.example.test");
});
it("rejects arbitrary URL identities before fetching", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    new ResendReceivingProvider("synthetic", fetcher).retrieve("https://example.test"),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["identity", "header", "shape", "http"])(
  "rejects invalid %s provider responses",
  async (kind) => {
    const value = response();
    if (kind === "identity") value.id = randomUUID();
    if (kind === "header") value.from = "sender@example.test\r\nBcc: victim@example.test";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        kind === "http"
          ? new Response("error", { status: 503 })
          : Response.json(kind === "shape" ? {} : value),
      );
    await expect(new ResendReceivingProvider("synthetic", fetcher).retrieve(id)).rejects.toThrow();
  },
);
it("cancels a streamed response that exceeds one MiB", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
    },
    cancel,
  });
  await expect(
    new ResendReceivingProvider(
      "synthetic",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)),
    ).retrieve(id),
  ).rejects.toThrow("exceeds");
  expect(cancel).toHaveBeenCalledOnce();
});
it("does not promote a display-name From string into a verified identity", async () => {
  const value = { ...response(), from: "A Person <sender@example.test>" };
  const mail = await new ResendReceivingProvider(
    "synthetic",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)),
  ).retrieve(id);
  expect(mail.senderAddress).toBeNull();
});
