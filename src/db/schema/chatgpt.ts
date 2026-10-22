// Encrypted application-owned OAuth registrations. No browser/session tables expose tokens.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, instant } from "./columns";

export const chatgptOauthHosts = pgTable(
  "chatgpt_oauth_hosts",
  {
    key: text("key").primaryKey(),
    hostId: text("host_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("chatgpt_oauth_hosts_id_idx").on(t.hostId),
    check("chatgpt_oauth_hosts_key", sql`${t.key} ~ '^[A-Za-z0-9_-]{1,80}$'`),
  ],
);

export const chatgptOauthRegistrations = pgTable(
  "chatgpt_oauth_registrations",
  {
    hostKey: text("host_key")
      .notNull()
      .references(() => chatgptOauthHosts.key),
    id: text("id").notNull(),
    issuer: text("issuer").$type<"https://auth.openai.com">().notNull(),
    clientId: text("client_id").notNull(),
    subject: text("subject").notNull(),
    label: text("label").notNull(),
    encryptedCredential: text("encrypted_credential").notNull(),
    connected: boolean("connected").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.hostKey, t.id] }),
    uniqueIndex("chatgpt_oauth_registrations_identity_idx").on(
      t.hostKey,
      t.issuer,
      t.clientId,
      t.subject,
    ),
    check(
      "chatgpt_oauth_registrations_identity",
      sql`${t.issuer} = 'https://auth.openai.com' and ${t.id} ~ '^[a-f0-9]{64}$' and length(${t.clientId}) between 1 and 512 and ${t.clientId} <> 'dynamic_agent_client' and length(${t.subject}) between 1 and 512`,
    ),
    check(
      "chatgpt_oauth_registrations_encrypted",
      sql`${t.encryptedCredential} like 'v1.%' and length(${t.encryptedCredential}) < 262144 and ${t.version} > 0`,
    ),
  ],
);
