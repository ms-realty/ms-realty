// O26/F30: restricted working records and immutable saved/reviewed evidence editions.
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, mutable } from "./columns";
import { principals } from "./identity";

export const privacyGovernanceRecords = pgTable(
  "privacy_governance_records",
  {
    ...mutable(),
    kind: text("kind").notNull(),
    document: jsonb("document").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedById: uuid("updated_by_id")
      .notNull()
      .references(() => principals.id),
  },
  (t) => [
    check("privacy_governance_kind", sql`${t.kind} in ('processing', 'processor', 'incident')`),
    check("privacy_governance_hash", sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("privacy_governance_version", sql`${t.version} > 0`),
    check(
      "privacy_governance_document_kind",
      sql`${t.document} ? 'kind' and ${t.document}->>'kind' = ${t.kind}`,
    ),
  ],
);

export const privacyGovernanceRevisions = pgTable(
  "privacy_governance_revisions",
  {
    id: id(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => privacyGovernanceRecords.id),
    recordVersion: integer("record_version").notNull(),
    action: text("action").notNull(),
    document: jsonb("document").notNull(),
    contentHash: text("content_hash").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => principals.id),
    recordedAt: createdAt(),
    note: text("note"),
    operationId: text("operation_id").notNull().unique(),
  },
  (t) => [
    unique("privacy_governance_record_revision").on(t.recordId, t.recordVersion),
    check("privacy_governance_revision_positive", sql`${t.recordVersion} > 0`),
    check("privacy_governance_revision_hash", sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("privacy_governance_revision_action", sql`${t.action} in ('saved', 'reviewed')`),
    check(
      "privacy_governance_review_note",
      sql`${t.action} <> 'reviewed' or (${t.note} is not null and length(${t.note}) >= 10)`,
    ),
  ],
);
