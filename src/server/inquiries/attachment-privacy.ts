// P19/O26: inquiry photos are retained assessment evidence, not disposable account copies.
import "server-only";
import { asc, eq } from "drizzle-orm";
import { inquiryAttachments } from "@/db/schema/inquiry-attachments";
import { inquiries } from "@/db/schema/work";
import type { Actor } from "@/domain/capabilities";
import type { PrivacyExportSource } from "@/domain/privacy-export";
import { can } from "../authz";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

type Attachment = typeof inquiryAttachments.$inferSelect;
export type InquiryAttachmentPrivacyRow = {
  attachment: Attachment;
  inquiry: { id: string; reference: string; version: number };
};

/** No object key, receipt-session hash, filename, customer identity or byte URL leaves here. */
export function attachmentPrivacyProjection(
  records: readonly InquiryAttachmentPrivacyRow[],
  readable: ReadonlySet<string>,
) {
  const rows: {
    id: string;
    inquiryReference: string;
    createdAt: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
    state: string;
    scan: string;
    sha256: string;
  }[] = [];
  const sources: PrivacyExportSource[] = [];
  let blocked = false;
  for (const { attachment: item, inquiry } of records) {
    if (!readable.has(inquiry.id)) {
      blocked = true;
      continue;
    }
    rows.push({
      id: item.id,
      inquiryReference: inquiry.reference,
      createdAt: item.createdAt.toISOString(),
      contentType: item.contentType,
      byteSize: item.byteSize,
      width: item.width,
      height: item.height,
      state: item.state,
      scan: item.scan,
      sha256: item.sha256,
    });
    // Disclosure is a separate human-reviewed supplement decision. A scan is neither
    // permission to publish nor permission to expose another person's photo in an export.
    sources.push({
      key: `inquiry_attachment:${item.id}`,
      kind: "agency_record",
      id: item.id,
      digest: hashRequest(JSON.parse(JSON.stringify({ inquiry, item }))),
    });
    if (
      item.state !== "sealed" ||
      item.erasedAt ||
      item.scan !== "clean" ||
      !item.scannedAt ||
      !item.scannerVersion ||
      item.scannedSha256 !== item.sha256
    )
      blocked = true;
  }
  return { rows, sources, blocked, hasRetainedBusiness: records.length > 0 };
}

/** Follow current inquiry ownership; a later Case link never invents an owner-photo grant. */
export async function collectInquiryAttachmentPrivacy(db: Executor, actor: Actor, partyId: string) {
  const records = await db
    .select({
      attachment: inquiryAttachments,
      inquiry: { id: inquiries.id, reference: inquiries.reference, version: inquiries.version },
    })
    .from(inquiryAttachments)
    .innerJoin(inquiries, eq(inquiries.id, inquiryAttachments.inquiryId))
    .where(eq(inquiries.partyId, partyId))
    .orderBy(asc(inquiryAttachments.id))
    .limit(301);
  if (records.length > 300) throw new AppError("validation_failed");
  const readable = new Set<string>();
  for (const id of new Set(records.map((row) => row.inquiry.id)))
    if (await can(db, actor, "inquiry.read", { type: "inquiry", id })) readable.add(id);
  const revision = keyedHash(
    getEnv().authSecret,
    `inquiry-attachment-privacy:v1:${hashRequest(JSON.parse(JSON.stringify(records)))}`,
  );
  return { revision, ...attachmentPrivacyProjection(records, readable) };
}
