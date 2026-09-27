// Purpose-bound client requests. Submitting a request never grants access or approves evidence.
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, mutable } from "./columns";
import { processPolicies } from "./compliance";
import { documents, documentVersions } from "./coordination";
import { participantRoleEnum } from "./enums";
import { grants, invitations, principals } from "./identity";
import { caseParticipants, cases, tasks } from "./work";

export const caseAccessRequests = pgTable(
  "case_access_requests",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => principals.id),
    requesterParticipantId: uuid("requester_participant_id")
      .notNull()
      .references(() => caseParticipants.id),
    kind: text("kind").$type<"invite" | "remove">().notNull(),
    targetParticipantId: uuid("target_participant_id").references(() => caseParticipants.id),
    // Private to the requester and authorized staff, never a Case-wide address book.
    targetEmail: text("target_email"),
    targetName: text("target_name"),
    requestedRole: participantRoleEnum("requested_role"),
    reason: text("reason").notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    state: text("state")
      .$type<"pending" | "approved" | "declined" | "withdrawn">()
      .notNull()
      .default("pending"),
    decidedById: uuid("decided_by_id").references(() => principals.id),
    decidedAt: instant("decided_at"),
    clientOutcome: text("client_outcome"),
    invitationId: uuid("invitation_id").references(() => invitations.id),
  },
  (t) => [
    index("case_access_requests_case_idx").on(t.caseId, t.state),
    index("case_access_requests_requester_idx").on(t.requestedById),
    check("case_access_requests_kind", sql`${t.kind} in ('invite','remove')`),
    check(
      "case_access_requests_state",
      sql`${t.state} in ('pending','approved','declined','withdrawn')`,
    ),
    check(
      "case_access_requests_target",
      sql`(${t.kind} = 'invite' and ${t.targetEmail} is not null and ${t.targetName} is not null and ${t.requestedRole} is not null and ${t.targetParticipantId} is null) or (${t.kind} = 'remove' and ${t.targetParticipantId} is not null and ${t.targetEmail} is null and ${t.targetName} is null and ${t.requestedRole} is null)`,
    ),
    check(
      "case_access_requests_decision",
      sql`${t.state} = 'pending' or (${t.decidedById} is not null and ${t.decidedAt} is not null and ${t.clientOutcome} is not null)`,
    ),
  ],
);

export const documentRequests = pgTable(
  "document_requests",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => principals.id),
    recipientParticipantId: uuid("recipient_participant_id")
      .notNull()
      .references(() => caseParticipants.id),
    documentId: uuid("document_id")
      .notNull()
      .unique()
      .references(() => documents.id),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grants.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => processPolicies.id),
    policyHash: text("policy_hash").notNull(),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    instructions: text("instructions").notNull(),
    alternatives: text("alternatives").notNull(),
    allowedContentTypes: jsonb("allowed_content_types").$type<string[]>().notNull(),
    maxBytes: integer("max_bytes").notNull(),
    expiresAt: instant("expires_at").notNull(),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => principals.id),
    cancelledAt: instant("cancelled_at"),
    cancelledById: uuid("cancelled_by_id").references(() => principals.id),
    clientOutcome: text("client_outcome"),
    reviewedVersionId: uuid("reviewed_version_id").references(() => documentVersions.id),
  },
  (t) => [
    index("document_requests_recipient_idx").on(t.recipientId, t.caseId),
    index("document_requests_case_idx").on(t.caseId),
    check("document_requests_size", sql`${t.maxBytes} between 1 and 20971520`),
    check(
      "document_requests_types",
      sql`jsonb_typeof(${t.allowedContentTypes}) = 'array' and jsonb_array_length(${t.allowedContentTypes}) > 0`,
    ),
    check(
      "document_requests_cancellation",
      sql`${t.cancelledAt} is null or (${t.cancelledById} is not null and ${t.clientOutcome} is not null)`,
    ),
  ],
);
