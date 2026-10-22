import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { MAX_DOCUMENT_BYTES } from "../files/storage";
import { ResendAttachmentProvider } from "./resend-attachment";

const emailId = randomUUID(),
  attachmentId = randomUUID();
const bytes = Buffer.from("%PDF-1.7\nSynthetic attachment\n%%EOF");
const response = () => ({
  id: attachmentId,
  filename: "untrusted.pdf",
  content_type: "application/pdf",
  size: bytes.length,
  download_url: `https://inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}?signature=synthetic`,
  expires_at: new Date(Date.now() + 3600000).toISOString(),
});
it("binds metadata to one identity and downloads bounded bytes without forwarding the API secret", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(response()))
    .mockResolvedValueOnce(new Response(bytes));
  const result = await new ResendAttachmentProvider("synthetic-secret", fetcher).retrieveAttachment(
    emailId,
    attachmentId,
  );
  expect(result).toEqual({
    emailId,
    id: attachmentId,
    fileName: "untrusted.pdf",
    contentType: "application/pdf",
    bytes,
  });
  expect(fetcher.mock.calls[0]).toEqual([
    `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
    expect.objectContaining({
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "Bearer synthetic-secret", Accept: "application/json" },
    }),
  ]);
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/octet-stream" },
  });
  expect(JSON.stringify(fetcher.mock.calls[1]?.[1])).not.toContain("synthetic-secret");
  expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(fetcher.mock.calls[1]?.[1]?.signal);
  expect(JSON.stringify(result)).not.toContain("signature");
});
it.each([
  "http://inbound-cdn.resend.com",
  "https://inbound-cdn.resend.com.evil.test",
  "https://127.0.0.1",
  "https://inbound-cdn.resend.com:444",
  "https://user:password@inbound-cdn.resend.com",
])("rejects a hostile download origin %s", async (origin) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      ...response(),
      download_url: `${origin}/${emailId}/attachments/${attachmentId}`,
    }),
  );
  await expect(
    new ResendAttachmentProvider("synthetic", fetcher).retrieveAttachment(emailId, attachmentId),
  ).rejects.toThrow("retrieval failed");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["identity", "path", "fragment", "expired", "size", "shape", "http"])(
  "rejects %s metadata before download",
  async (kind) => {
    const value = response();
    if (kind === "identity") value.id = randomUUID();
    if (kind === "path") value.download_url = value.download_url.replace(emailId, randomUUID());
    if (kind === "fragment") value.download_url += "#fragment";
    if (kind === "expired") value.expires_at = new Date(0).toISOString();
    if (kind === "size") value.size = MAX_DOCUMENT_BYTES + 1;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        kind === "http"
          ? new Response("denied", { status: 403 })
          : Response.json(kind === "shape" ? {} : value),
      );
    await expect(
      new ResendAttachmentProvider("synthetic", fetcher).retrieveAttachment(emailId, attachmentId),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each(["empty", "short", "long", "http", "redirect"])("rejects %s download", async (kind) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(response()));
  if (kind === "redirect")
    fetcher.mockRejectedValueOnce(new Error("https://private.example.test/?signature=secret"));
  else
    fetcher.mockResolvedValueOnce(
      new Response(
        kind === "empty"
          ? null
          : kind === "short"
            ? bytes.subarray(1)
            : kind === "long"
              ? Buffer.concat([bytes, bytes])
              : bytes,
        { status: kind === "http" ? 503 : 200 },
      ),
    );
  await expect(
    new ResendAttachmentProvider("synthetic", fetcher).retrieveAttachment(emailId, attachmentId),
  ).rejects.toThrow(/^Attachment provider retrieval failed$/);
});
it("cancels oversized streamed bytes even without content-length", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(bytes.length + 1));
    },
    cancel,
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(response()))
    .mockResolvedValueOnce(new Response(stream));
  await expect(
    new ResendAttachmentProvider("synthetic", fetcher).retrieveAttachment(emailId, attachmentId),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});
it("rejects invalid IDs without network access", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    new ResendAttachmentProvider("synthetic", fetcher).retrieveAttachment(
      "https://example.test",
      attachmentId,
    ),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
