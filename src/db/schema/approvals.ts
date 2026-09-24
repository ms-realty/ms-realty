// Approvals bound to a subject version by hash and scope (spec §19.2, F12, F24, F29).
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, mutable } from "./columns";
import { actorKindEnum, approvalKindEnum, approvalStateEnum, capabilityEnum } from "./enums";

export const approvals = pgTable(
  "approvals",
  {
    ...mutable(),
    kind: approvalKindEnum("kind").notNull(),
    state: approvalStateEnum("state").notNull().default("pending"),
    /** e.g. listing_version, translation, message, proposal_version, publication_release. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    /** SHA-256 of the canonical subject content; a different hash means a different subject. */
    subjectHash: text("subject_hash").notNull(),
    /** Locales, destinations, recipients or amount limits the approval covers. */
    scope: jsonb("scope").notNull().default({}),
    requestedByKind: actorKindEnum("requested_by_kind").notNull(),
    requestedById: text("requested_by_id").notNull(),
    decidedByKind: actorKindEnum("decided_by_kind"),
    decidedById: text("decided_by_id"),
    /** The capability the decider exercised. */
    decidedWithCapability: capabilityEnum("decided_with_capability"),
    decidedAt: instant("decided_at"),
    decisionNote: text("decision_note"),
    invalidatedAt: instant("invalidated_at"),
    invalidationReason: text("invalidation_reason"),
  },
  (t) => [
    // A66: only a human (staff or client) decides an approval.
    check(
      "approvals_human_decision",
      sql`${t.state} not in ('approved', 'rejected') or (coalesce(${t.decidedByKind} in ('staff', 'client'), false) and ${t.decidedById} is not null and ${t.decidedAt} is not null)`,
    ),
    index("approvals_subject_idx").on(t.subjectType, t.subjectId, t.subjectVersion),
  ],
);
