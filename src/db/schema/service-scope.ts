// B11: one working draft and immutable human-reviewed scope editions.
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, mutable } from "./columns";
import { principals } from "./identity";

export const serviceScopeDrafts = pgTable(
  "service_scope_drafts",
  {
    ...mutable(),
    document: jsonb("document").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedById: uuid("updated_by_id")
      .notNull()
      .references(() => principals.id),
  },
  (t) => [
    check("service_scope_draft_singleton", sql`${t.id} = '00000000-0000-4000-8000-000000000029'`),
  ],
);
export const serviceScopeVersions = pgTable(
  "service_scope_versions",
  {
    id: id(),
    scopeVersion: integer("scope_version").notNull().unique(),
    draftRevision: integer("draft_revision").notNull(),
    document: jsonb("document").notNull(),
    contentHash: text("content_hash").notNull(),
    approvedById: uuid("approved_by_id")
      .notNull()
      .references(() => principals.id),
    approvedAt: createdAt(),
    approvalNote: text("approval_note").notNull(),
    operationId: text("operation_id").notNull().unique(),
  },
  (t) => [
    check("service_scope_version_positive", sql`${t.scopeVersion} > 0 and ${t.draftRevision} > 0`),
    check("service_scope_content_hash", sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
