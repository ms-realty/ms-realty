// R08 / AT64: local source history only. No archive authority or complete writer coverage.
import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { RecoveryExpectation, RecoveryPacket } from "../../domain/recovery-archive";
import { createdAt } from "./columns";
import { operations } from "./records";

export const recoverySource = pgTable(
  "recovery_source",
  {
    key: text("key").primaryKey(),
    state: text("state").notNull().default("inactive"),
    context: jsonb("context").$type<RecoveryExpectation["context"]>(),
    contextDigest: text("context_digest").unique(),
    admittedWriters: jsonb("admitted_writers").$type<string[]>().notNull().default([]),
    coverageState: text("coverage_state").notNull().default("incomplete"),
    unresolvedWriters: jsonb("unresolved_writers")
      .$type<string[]>()
      .notNull()
      .default(["domain_writers_uninstrumented", "external_and_unclassified_writers"]),
    closedHead: jsonb("closed_head").$type<{ sequence: number; digest: string }>(),
    closeReceiptDigest: text("close_receipt_digest"),
  },
  (t) => [
    check("recovery_source_singleton", sql`${t.key} = 'source'`),
    check("recovery_source_state", sql`${t.state} in ('inactive', 'admitted', 'closed')`),
    check("recovery_source_incomplete", sql`${t.coverageState} = 'incomplete'`),
    check(
      "recovery_source_writers",
      sql`jsonb_typeof(${t.admittedWriters}) = 'array' and jsonb_typeof(${t.unresolvedWriters}) = 'array' and jsonb_array_length(${t.unresolvedWriters}) > 0`,
    ),
    check(
      "recovery_source_context",
      sql`(${t.state} = 'inactive' and ${t.context} is null and ${t.contextDigest} is null and jsonb_array_length(${t.admittedWriters}) = 0) or (${t.state} <> 'inactive' and ${t.context} is not null and ${t.contextDigest} is not null and ${t.contextDigest} ~ '^[a-f0-9]{64}$' and jsonb_array_length(${t.admittedWriters}) > 0)`,
    ),
    check(
      "recovery_source_close",
      sql`(${t.state} <> 'closed' and ${t.closedHead} is null and ${t.closeReceiptDigest} is null) or (${t.state} = 'closed' and ${t.closedHead} is not null and ${t.closeReceiptDigest} is not null and ${t.closeReceiptDigest} ~ '^[a-f0-9]{64}$')`,
    ),
  ],
);

/** A row lock allocates sequences transactionally; a rolled-back append consumes no number. */
export const recoveryJournalHead = pgTable(
  "recovery_journal_head",
  {
    key: text("key")
      .primaryKey()
      .references(() => recoverySource.key),
    sequence: bigint("sequence", { mode: "number" }).notNull().default(0),
    digest: text("digest").notNull().default("0".repeat(64)),
  },
  (t) => [
    check("recovery_journal_head_key", sql`${t.key} = 'source'`),
    check("recovery_journal_head_sequence", sql`${t.sequence} between 0 and 9007199254740991`),
    check(
      "recovery_journal_head_digest",
      sql`${t.digest} ~ '^[a-f0-9]{64}$' and ((${t.sequence} = 0) = (${t.digest} = repeat('0', 64)))`,
    ),
  ],
);

type Entry = RecoveryPacket["segments"][number]["entries"][number];
export const recoveryJournal = pgTable(
  "recovery_journal",
  {
    sequence: bigint("sequence", { mode: "number" }).primaryKey(),
    contextDigest: text("context_digest")
      .notNull()
      .references(() => recoverySource.contextDigest),
    transactionRef: uuid("transaction_ref").notNull().unique(),
    previousDigest: text("previous_digest").notNull(),
    digest: text("digest").notNull().unique(),
    effects: jsonb("effects").$type<Entry["effects"]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("recovery_journal_sequence", sql`${t.sequence} between 1 and 9007199254740991`),
    check(
      "recovery_journal_digests",
      sql`${t.contextDigest} ~ '^[a-f0-9]{64}$' and ${t.previousDigest} ~ '^[a-f0-9]{64}$' and ${t.digest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "recovery_journal_effects",
      sql`jsonb_typeof(${t.effects}) = 'array' and jsonb_array_length(${t.effects}) > 0`,
    ),
  ],
);

/** Private, strict denial bodies; an archive adapter must encrypt their exact UTF-8 bytes. */
export const recoveryPayloads = pgTable(
  "recovery_payloads",
  {
    digest: text("digest").primaryKey(),
    contextDigest: text("context_digest")
      .notNull()
      .references(() => recoverySource.contextDigest),
    kind: text("kind").notNull(),
    subjectDigest: text("subject_digest").notNull(),
    canonicalBody: text("canonical_body").notNull(),
    byteLength: bigint("byte_length", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "recovery_payload_kind",
      sql`${t.kind} in ('access_revocation','privacy_restriction','deletion_decision','consent_withdrawal','publication_withdrawal')`,
    ),
    check(
      "recovery_payload_digests",
      sql`${t.digest} ~ '^[a-f0-9]{64}$' and ${t.contextDigest} ~ '^[a-f0-9]{64}$' and ${t.subjectDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "recovery_payload_length",
      sql`${t.byteLength} > 0 and ${t.byteLength} = octet_length(${t.canonicalBody})`,
    ),
  ],
);

/** References identify accepted activity; they never authorize replaying a customer command. */
export const recoveryOperationReferences = pgTable(
  "recovery_operation_references",
  {
    operationId: uuid("operation_id")
      .primaryKey()
      .references(() => operations.id),
    sequence: bigint("sequence", { mode: "number" })
      .notNull()
      .references(() => recoveryJournal.sequence),
    receiptDigest: text("receipt_digest").notNull(),
  },
  (t) => [check("recovery_operation_receipt_digest", sql`${t.receiptDigest} ~ '^[a-f0-9]{64}$'`)],
);
