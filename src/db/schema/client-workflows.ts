// C05/C06 evidence and personal saves. These records never create a Case grant.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant } from "./columns";
import { appointmentParticipants, appointments, appointmentVersions } from "./coordination";
import { principals } from "./identity";
import { listings } from "./inventory";
import { operations } from "./records";

/** Immutable participant-authored response to the exact version and proposed slot. */
export const appointmentParticipantResponses = pgTable(
  "appointment_participant_responses",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    appointmentVersion: integer("appointment_version").notNull(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => appointmentParticipants.id),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
    decision: text("decision").notNull(),
    startsAt: instant("starts_at").notNull(),
    endsAt: instant("ends_at").notNull(),
    timezone: text("timezone").notNull(),
    note: text("note"),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "appointment_response_version_fk",
      columns: [t.appointmentId, t.appointmentVersion],
      foreignColumns: [appointmentVersions.appointmentId, appointmentVersions.versionNumber],
    }),
    uniqueIndex("appointment_response_participant_version_idx").on(
      t.appointmentId,
      t.appointmentVersion,
      t.participantId,
    ),
    uniqueIndex("appointment_response_operation_idx").on(t.operationId),
    check(
      "appointment_response_decision",
      sql`${t.decision} in ('accept','decline','alternative')`,
    ),
    check("appointment_response_slot", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "appointment_response_note",
      sql`${t.decision} = 'accept' or (${t.note} is not null and length(trim(${t.note})) >= 3)`,
    ),
  ],
);

/** Personal account ownership, with no Case, Interest or participant side effect. */
export const personalSavedListings = pgTable(
  "personal_saved_listings",
  {
    id: id(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("personal_saved_principal_listing_idx").on(t.principalId, t.listingId)],
);

/** Short-lived public selection capability; raw nonce and client credentials are never stored. */
export const savedSelectionTransfers = pgTable(
  "saved_selection_transfers",
  {
    id: id(),
    nonceHash: text("nonce_hash").notNull().unique(),
    creatorSessionHash: text("creator_session_hash").notNull(),
    sourceOrigin: text("source_origin").notNull(),
    targetOrigin: text("target_origin").notNull(),
    targetPath: text("target_path").notNull(),
    listingReferences: text("listing_references").array().notNull(),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    consumedAt: instant("consumed_at"),
    consumedById: uuid("consumed_by_id").references(() => principals.id),
    operationId: uuid("operation_id").references(() => operations.id),
  },
  (t) => [
    index("saved_transfer_creator_idx").on(t.creatorSessionHash, t.createdAt),
    check(
      "saved_transfer_bounds",
      sql`cardinality(${t.listingReferences}) between 1 and 100 and ${t.expiresAt} > ${t.createdAt}`,
    ),
    check(
      "saved_transfer_consumed",
      sql`(${t.consumedAt} is null and ${t.consumedById} is null and ${t.operationId} is null) or (${t.consumedAt} is not null and ${t.consumedById} is not null and ${t.operationId} is not null)`,
    ),
  ],
);
