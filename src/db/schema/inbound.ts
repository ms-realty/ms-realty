// Untrusted provider material stays in staff triage until an attributable Case decision.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import { documentVersions, messages } from "./coordination";
import { principals } from "./identity";
import { parties } from "./parties";
import { inboxEvents } from "./records";
import { cases } from "./work";
export const inboundEmails = pgTable(
  "inbound_emails",
  {
    ...mutable(),
    provider: text("provider").notNull(),
    providerEmailId: uuid("provider_email_id").notNull(),
    inboxEventId: uuid("inbox_event_id")
      .notNull()
      .references(() => inboxEvents.id),
    sourceDigest: text("source_digest").notNull(),
    sender: text("sender").notNull(),
    senderAddress: text("sender_address"),
    recipients: jsonb("recipients").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    htmlOmitted: boolean("html_omitted").notNull(),
    attachments: jsonb("attachments").notNull(),
    authentication: jsonb("authentication").notNull(),
    receivedAt: instant("received_at").notNull(),
    state: text("state").notNull().default("triage"),
    originatingMessageId: uuid("originating_message_id").references(() => messages.id),
    suggestedCaseId: uuid("suggested_case_id").references(() => cases.id),
    caseId: uuid("case_id").references(() => cases.id),
    senderPartyId: uuid("sender_party_id").references(() => parties.id),
    messageId: uuid("message_id").references(() => messages.id),
    decidedById: uuid("decided_by_id").references(() => principals.id),
    decidedAt: instant("decided_at"),
    decisionNote: text("decision_note"),
  },
  (t) => [
    uniqueIndex("inbound_email_provider_idx").on(t.provider, t.providerEmailId),
    index("inbound_email_state_idx").on(t.state, t.receivedAt),
    index("inbound_email_case_idx").on(t.caseId, t.receivedAt),
    check("inbound_email_known_state", sql`${t.state} in ('triage','assigned','rejected')`),
    check(
      "inbound_email_decided",
      sql`${t.state} = 'triage' or (${t.decidedById} is not null and ${t.decidedAt} is not null and ${t.decisionNote} is not null)`,
    ),
    check(
      "inbound_email_assigned",
      sql`${t.state} <> 'assigned' or (${t.caseId} is not null and ${t.senderPartyId} is not null and ${t.messageId} is not null)`,
    ),
  ],
);

/** Append-only provenance for a human-selected import; scanning and acceptance remain separate. */
export const inboundAttachmentImports = pgTable(
  "inbound_attachment_imports",
  {
    id: id(),
    createdAt: createdAt(),
    inboundEmailId: uuid("inbound_email_id")
      .notNull()
      .references(() => inboundEmails.id),
    attachmentId: uuid("attachment_id").notNull(),
    sourceDigest: text("source_digest").notNull(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    senderPartyId: uuid("sender_party_id")
      .notNull()
      .references(() => parties.id),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id),
    sha256: text("sha256").notNull(),
    importedById: uuid("imported_by_id")
      .notNull()
      .references(() => principals.id),
    reason: text("reason").notNull(),
  },
  (t) => [
    uniqueIndex("inbound_attachment_source_idx").on(t.inboundEmailId, t.attachmentId),
    uniqueIndex("inbound_attachment_version_idx").on(t.documentVersionId),
    check(
      "inbound_attachment_digest",
      sql`${t.sha256} ~ '^[a-f0-9]{64}$' and ${t.sourceDigest} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
