// AT45/UX23: application safety history. This does not prove an independent archive.
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import type { PrivacySafetyEffect } from "../../domain/privacy-erasure";
import { createdAt, id, instant } from "./columns";
import { parties } from "./parties";

export const privacySafetyDecisions = pgTable(
  "privacy_safety_decisions",
  {
    sequence: bigint("sequence", { mode: "number" }).primaryKey(),
    id: uuid("id").notNull().unique(),
    operationId: uuid("operation_id").notNull().unique(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    // Not a foreign key: a newer independent tail can precede its request on an old snapshot.
    requestId: uuid("request_id"),
    requestHash: text("request_hash").notNull(),
    review: jsonb("review").notNull(),
    effect: jsonb("effect").$type<PrivacySafetyEffect>().notNull(),
    previousDigest: text("previous_digest").notNull(),
    digest: text("digest").notNull(),
    recordedAt: instant("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    index("privacy_safety_party_idx").on(t.partyId, t.sequence),
    check("privacy_safety_sequence", sql`${t.sequence} between 1 and 9007199254740991`),
    check(
      "privacy_safety_digests",
      sql`${t.requestHash} ~ '^[a-f0-9]{64}$' and ${t.previousDigest} ~ '^[a-f0-9]{64}$' and ${t.digest} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

/** A restriction has no implicit expiry or automatic release path. Staff identities are excluded. */
export const privacyProcessingRestrictions = pgTable(
  "privacy_processing_restrictions",
  {
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    purpose: text("purpose").notNull(),
    decisionSequence: bigint("decision_sequence", { mode: "number" })
      .notNull()
      .references(() => privacySafetyDecisions.sequence),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.partyId, t.purpose] }),
    check(
      "privacy_processing_purpose",
      sql`${t.purpose} in ('search_alerts','marketing','client_access')`,
    ),
  ],
);

/** Append-only observations. No checkbox or mutable status can turn a held boundary into proof. */
export const privacyPropagationEvents = pgTable(
  "privacy_propagation_events",
  {
    id: id(),
    decisionSequence: bigint("decision_sequence", { mode: "number" })
      .notNull()
      .references(() => privacySafetyDecisions.sequence),
    boundary: text("boundary").notNull(),
    state: text("state").notNull(),
    evidence: jsonb("evidence").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("privacy_propagation_decision_idx").on(t.decisionSequence),
    check(
      "privacy_propagation_boundary",
      sql`${t.boundary} in ('application','business_and_history','private_files','provider_data','independent_archive','restore_reapplication')`,
    ),
    check("privacy_propagation_state", sql`${t.state} in ('applied','held','unsupported')`),
  ],
);
