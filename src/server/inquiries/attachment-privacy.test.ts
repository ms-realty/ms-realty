import { expect, it } from "vitest";
import {
  attachmentPrivacyProjection,
  type InquiryAttachmentPrivacyRow,
} from "./attachment-privacy";

const source = (): InquiryAttachmentPrivacyRow => ({
  inquiry: { id: "00000000-0000-4000-8000-000000000001", reference: "RQ-SYNTHETIC", version: 1 },
  attachment: {
    id: "00000000-0000-4000-8000-000000000002",
    inquiryId: "00000000-0000-4000-8000-000000000001",
    operationId: "00000000-0000-4000-8000-000000000003",
    createdAt: new Date(0),
    stagingKey: "staging/private-synthetic",
    sealedKey: "sealed/private-synthetic",
    sha256: "a".repeat(64),
    contentType: "image/webp",
    byteSize: 100,
    width: 10,
    height: 10,
    state: "sealed",
    scan: "clean",
    scannedAt: new Date(0),
    scannerVersion: "synthetic-scanner",
    scannedSha256: "a".repeat(64),
    erasedAt: null,
  },
});
it("P19/O26 includes safe metadata, fingerprints the exact source and holds unknown scan/authority scope", () => {
  const item = source();
  const result = attachmentPrivacyProjection([item], new Set([item.inquiry.id]));
  expect(result.blocked).toBe(false);
  expect(result.hasRetainedBusiness).toBe(true);
  expect(result.rows).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("private-synthetic");
  const changed = attachmentPrivacyProjection(
    [{ ...item, attachment: { ...item.attachment, scannedSha256: "b".repeat(64) } }],
    new Set([item.inquiry.id]),
  );
  expect(changed.blocked).toBe(true);
  expect(changed.sources[0]?.digest).not.toBe(result.sources[0]?.digest);
  const denied = attachmentPrivacyProjection([item], new Set());
  expect(denied).toMatchObject({ rows: [], sources: [], blocked: true, hasRetainedBusiness: true });
  expect(attachmentPrivacyProjection([], new Set())).toMatchObject({
    rows: [],
    sources: [],
    blocked: false,
    hasRetainedBusiness: false,
  });
});
