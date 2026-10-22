// Expiring authority for one staging upload. Public serving never reads staging keys.
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant } from "./columns";
import { actorKindEnum } from "./enums";

export const fileUploads = pgTable(
  "file_uploads",
  {
    id: id(),
    createdAt: createdAt(),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    stagingKey: text("staging_key").notNull().unique(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: instant("expires_at").notNull(),
    completedAt: instant("completed_at"),
    byteSize: bigint("byte_size", { mode: "number" }),
    contentType: text("content_type"),
  },
  (t) => [
    check("file_uploads_target_type", sql`${t.targetType} in ('media', 'document')`),
    check("file_uploads_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    check("file_uploads_size", sql`${t.byteSize} is null or ${t.byteSize} >= 0`),
    index("file_uploads_actor_idx").on(t.actorKind, t.actorId),
  ],
);
