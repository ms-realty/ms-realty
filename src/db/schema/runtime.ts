// Short-lived server state behind sign-in and external delivery (AD7, AD11, spec §07.5).
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { staffAccounts } from "./accounts";
import { createdAt, id, instant, mutable } from "./columns";
import { messages } from "./coordination";
import { messageChannelEnum, messageStateEnum } from "./enums";

/** Single-use WebAuthn challenges; a verified ceremony consumes its challenge. */
export const webauthnChallenges = pgTable(
  "webauthn_challenges",
  {
    id: id(),
    /** Base64url challenge as sent to the authenticator. */
    challenge: text("challenge").notNull().unique(),
    purpose: text("purpose").notNull(),
    /** Set for registration; authentication challenges are not bound to an account up front. */
    staffAccountId: uuid("staff_account_id").references(() => staffAccounts.id),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    consumedAt: instant("consumed_at"),
  },
  (t) => [
    check("webauthn_challenges_purpose", sql`${t.purpose} in ('registration', 'authentication')`),
  ],
);

/**
 * Transactional outbox for external messages. One row is one logical message: a retry reuses
 * the row and its idempotency key, and a dispatch whose result is unknown is never re-sent
 * automatically. Provider acceptance, delivery and failure are recorded separately.
 */
export const outboxMessages = pgTable(
  "outbox_messages",
  {
    ...mutable(),
    /** Caller-chosen logical identity; enqueueing the same key twice yields one message. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** The case message this delivers, when it is one (system mail such as sign-in has none). */
    messageId: uuid("message_id").references(() => messages.id),
    channel: messageChannelEnum("channel").notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    params: jsonb("params").notNull().default({}),
    /** Parameters that must not outlive dispatch (sign-in links); cleared when dispatch starts. */
    secretParams: jsonb("secret_params"),
    state: messageStateEnum("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    dispatchStartedAt: instant("dispatch_started_at"),
    acceptedAt: instant("accepted_at"),
    deliveredAt: instant("delivered_at"),
    failedAt: instant("failed_at"),
  },
  (t) => [
    check(
      "outbox_messages_state",
      sql`${t.state} in ('queued', 'provider_accepted', 'delivered', 'failed', 'outcome_unknown')`,
    ),
    index("outbox_messages_state_idx").on(t.state, t.updatedAt),
    index("outbox_messages_provider_idx").on(t.provider, t.providerMessageId),
  ],
);
