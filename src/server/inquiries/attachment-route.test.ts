import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/inquiries/[receiptId]/photos/route";
import { getEnv } from "../config/env";
import { AppError } from "../errors";
import { issueSubmissionKey, newReceiptSession, receiptCookieName } from "./intake";

const adapters = vi.hoisted(() => ({
  owner: vi.fn(),
  receive: vi.fn(),
  rate: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/inquiries/attachments", () => ({
  maxInquiryPhotoBytes: 8 * 1024 * 1024,
  ownerPhotoInquiry: adapters.owner,
  receiveInquiryPhoto: adapters.receive,
}));
vi.mock("@/server/files/config", () => ({ fileServices: () => ({}) }));
vi.mock("@/server/jobs/web", () => ({ getJobQueue: async () => ({}) }));
vi.mock("@/server/rate-limit", () => ({ enforceRateLimit: adapters.rate }));
vi.mock("@/server/recovery/quarantine", () => ({ assertRecoveryOpen: adapters.open }));
beforeEach(() => {
  vi.clearAllMocks();
  adapters.owner.mockImplementation(async (_db, owner) => {
    if (!owner.receiptSession) throw new AppError("not_found");
  });
  adapters.receive.mockResolvedValue({ stage: "scanning" });
});
function request(overrides: Record<string, string> = {}, duplicate = false) {
  const env = getEnv(),
    receiptId = issueSubmissionKey(),
    operationId = crypto.randomUUID();
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("sharedForInquiry", "1");
  form.append(
    "file",
    new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" }),
  );
  if (duplicate) form.append("file", new File(["extra"], "extra.png"));
  const headers = {
    host: new URL(env.hosts.public).host,
    origin: env.hosts.public,
    cookie: `${receiptCookieName(env)}=${newReceiptSession()}`,
    ...overrides,
  };
  return {
    req: new Request(`${env.hosts.public}/api/inquiries/${receiptId}/photos?locale=en`, {
      method: "POST",
      headers,
      body: form,
    }),
    receiptId,
    operationId,
  };
}
const post = (value: ReturnType<typeof request>) =>
  POST(value.req, { params: Promise.resolve({ receiptId: value.receiptId }) });
it("F10 checks exact Origin and receipt authorization before reading multipart bytes", async () => {
  const originCases: Record<string, string>[] = [
    { origin: "https://foreign.example.test" },
    { origin: "null" },
    {
      origin: "null",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    },
  ];
  for (const headers of originCases) {
    const value = request(headers),
      read = vi.spyOn(value.req.body as ReadableStream, "getReader");
    expect((await post(value)).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  }
  const missing = request({ cookie: "" }),
    read = vi.spyOn(missing.req.body as ReadableStream, "getReader");
  expect((await post(missing)).status).toBe(404);
  expect(read).not.toHaveBeenCalled();
  expect(adapters.receive).not.toHaveBeenCalled();
});
it("F10 accepts only browser-proven same-origin opaque native navigation and redirects to the fixed receipt", async () => {
  const value = request({
    origin: "null",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  });
  const result = await post(value);
  expect(result.status).toBe(303);
  const next = new URL(result.headers.get("location") ?? "");
  expect(next.origin).toBe(getEnv().hosts.public);
  expect(next.pathname).toBe(`/en/requests/${value.receiptId}`);
  expect(next.searchParams.get("photoOperation")).toBe(value.operationId);
  expect(adapters.receive).toHaveBeenCalledWith(
    {},
    {},
    {},
    expect.objectContaining({
      operationId: value.operationId,
      sharedForInquiry: true,
      bytes: Buffer.from([1, 2, 3]),
    }),
  );
  expect(adapters.rate).toHaveBeenCalledWith({}, "inquiry_photo.ip", expect.any(String));
});
it("F10 bounds native body size and one-file fields without changing the durable inquiry", async () => {
  for (const value of [request({ "content-length": String(9 * 1024 * 1024) }), request({}, true)]) {
    const result = await post(value);
    expect(result.status).toBe(303);
    const next = new URL(result.headers.get("location") ?? "");
    expect(next.pathname).toBe(`/en/requests/${value.receiptId}`);
    expect(next.searchParams.get("photoError")).toBe("validation_failed");
  }
  expect(adapters.receive).not.toHaveBeenCalled();
});
