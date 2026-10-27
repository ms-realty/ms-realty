// P18/P19: optional receipt-owned assessment photos are private inquiry evidence.
// They never become a Property, publication candidate, rights decision or public derivative.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant } from "./columns";
import { scanStateEnum } from "./enums";
import { inquiries } from "./work";

export const inquiryAttachments = pgTable(
  "inquiry_attachments",
  {
    id: id(),
    createdAt: createdAt(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id),
    /** One receipt-scoped retry identity binds to these exact measured bytes. */
    operationId: uuid("operation_id").notNull(),
    stagingKey: text("staging_key").notNull().unique(),
    sealedKey: text("sealed_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    state: text("state").notNull().default("reserved"),
    scan: scanStateEnum("scan").notNull().default("pending"),
    scannedAt: instant("scanned_at"),
    scannerVersion: text("scanner_version"),
    scannedSha256: text("scanned_sha256"),
    /** Set only by the separately verified private-object erasure workflow. */
    erasedAt: instant("erased_at"),
  },
  (t) => [
    uniqueIndex("inquiry_attachments_operation_idx").on(t.inquiryId, t.operationId),
    index("inquiry_attachments_inquiry_idx").on(t.inquiryId),
    check("inquiry_attachments_state", sql`${t.state} in ('reserved','sealed','erased')`),
    check("inquiry_attachments_digest", sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "inquiry_attachments_image",
      sql`${t.contentType} in ('image/jpeg','image/png','image/webp','image/avif','image/gif')`,
    ),
    check(
      "inquiry_attachments_bounds",
      sql`${t.byteSize} > 0 and ${t.byteSize} <= 8388608 and ${t.width} > 0 and ${t.height} > 0`,
    ),
    check(
      "inquiry_attachments_clean_binding",
      sql`${t.scan} <> 'clean' or (${t.state} = 'sealed' and ${t.scannedAt} is not null and ${t.scannerVersion} is not null and ${t.scannedSha256} = ${t.sha256})`,
    ),
    check(
      "inquiry_attachments_erasure",
      sql`(${t.state} = 'erased') = (${t.erasedAt} is not null)`,
    ),
  ],
);
