// UX S08 / §20.5: explicitly saved, short-lived response drafts, never business operations.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant } from "./columns";
import { proposalRevisions, proposals } from "./coordination";
import { emailSignInTokens, principals, sessions } from "./identity";

export const reauthDrafts = pgTable(
  "reauth_drafts",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    host: text("host").notNull(),
    command: text("command").notNull(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => proposalRevisions.id),
    sourceRevisionId: uuid("source_revision_id").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    state: text("state").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    restoredAt: instant("restored_at"),
  },
  (t) => [
    uniqueIndex("reauth_drafts_session_proposal").on(t.sessionId, t.proposalId),
    index("reauth_drafts_expiry").on(t.expiresAt),
    check(
      "reauth_drafts_scope",
      sql`${t.command} = 'proposal.decide' and ${t.expectedVersion} > 0`,
    ),
    check(
      "reauth_drafts_fields",
      sql`${t.state} in ('agreed_for_next_step', 'declined') and octet_length(${t.reason}) <= 24000 and char_length(${t.reason}) <= 6000`,
    ),
    check(
      "reauth_drafts_ttl",
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '15 minutes'`,
    ),
  ],
);

/** Optional lineage for a normal sign-in token; no private draft body travels in the job/link. */
export const reauthEmailLineage = pgTable(
  "reauth_email_lineage",
  {
    tokenId: uuid("token_id")
      .primaryKey()
      .references(() => emailSignInTokens.id, { onDelete: "cascade" }),
    sourceSessionId: uuid("source_session_id")
      .notNull()
      .references(() => sessions.id),
    host: text("host").notNull(),
    draftIds: jsonb("draft_ids").$type<string[]>().notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [
    check(
      "reauth_email_lineage_drafts",
      sql`jsonb_typeof(${t.draftIds}) = 'array' and jsonb_array_length(${t.draftIds}) between 1 and 4`,
    ),
  ],
);
