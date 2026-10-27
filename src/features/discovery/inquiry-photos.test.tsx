import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inquiryPhotoCopy } from "./inquiry-photo-copy";
import { InquiryPhotos } from "./inquiry-photos";

const source = vi.hoisted(() => ({
  canUpload: true,
  photos: [] as {
    id: string;
    operationId: string;
    byteSize: number;
    contentType: string;
    stage: "scanning" | "upload_incomplete";
  }[],
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/files/config", () => ({ fileServices: () => ({}) }));
vi.mock("@/server/inquiries/attachments", () => ({
  maxInquiryPhotos: 3,
  ownerInquiryPhotos: async () => source,
}));
const operations = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
const props = {
  locale: "en",
  receiptId: "synthetic-receipt",
  receiptSession: "synthetic-session",
} as const;
beforeEach(() => {
  source.canUpload = true;
  source.photos = operations.map((operationId, index) => ({
    id: operationId,
    operationId,
    byteSize: 100,
    contentType: "image/png",
    stage: index === 2 ? "upload_incomplete" : "scanning",
  }));
});
afterEach(cleanup);
it("F10 retries the interrupted third reservation with the same operation after a lost response or query", async () => {
  render(await InquiryPhotos(props));
  expect(document.querySelector('input[name="operationId"]')).toHaveValue(operations[2]);
  expect(screen.getByLabelText(inquiryPhotoCopy("en").retry)).toHaveAttribute("type", "file");
  expect(
    screen.getByRole("link", { name: `${inquiryPhotoCopy("en").retry} · Photo 3` }),
  ).toHaveAttribute(
    "href",
    `/en/requests/synthetic-receipt?photoOperation=${operations[2]}#inquiry-photo-title`,
  );
  expect(screen.getByRole("button", { name: inquiryPhotoCopy("en").retry })).toBeEnabled();
});
it("F10 an unknown operation query cannot replace an existing incomplete reservation", async () => {
  render(
    await InquiryPhotos({ ...props, requestedOperation: "00000000-0000-4000-8000-000000000099" }),
  );
  expect(document.querySelector('input[name="operationId"]')).toHaveValue(operations[2]);
});
it("F10 a closed inquiry retains its status/manual path without granting a retry capability", async () => {
  source.canUpload = false;
  render(await InquiryPhotos(props));
  expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Retry.*Photo 3/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /\+359/ })).toHaveAttribute("href", "tel:+359879696870");
});
