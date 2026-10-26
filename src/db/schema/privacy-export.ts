// C18/O26 · AT43/AT45: encrypted, reviewed person-scoped delivery, never public media.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, mutable } from "./columns";
import { principals } from "./identity";
import { parties } from "./parties";
import { privacyRequests } from "./records";

export const privacyExports = pgTable(
  "privacy_exports",
  {
    ...mutable(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => privacyRequests.id),
    requestVersion: integer("request_version").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => principals.id),
    state: text("state").$type<"draft" | "issued" | "revoked">().notNull().default("draft"),
    encryptedPayload: text("encrypted_payload").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    // Unimplemented/held categories keep fulfilment partial. A checkbox cannot waive them.
    coverageComplete: boolean("coverage_complete").notNull().default(false),
    encryptedReview: text("encrypted_review"),
    reviewSha256: text("review_sha256"),
    completedOperationId: uuid("completed_operation_id"),
    preparedById: uuid("prepared_by_id")
      .notNull()
      .references(() => principals.id),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    reviewedAt: instant("reviewed_at"),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    issuedOperationId: uuid("issued_operation_id"),
  },
  (t) => [
    index("privacy_exports_request_idx").on(t.requestId, t.createdAt),
    check("privacy_exports_state", sql`${t.state} in ('draft','issued','revoked')`),
    check("privacy_exports_size", sql`${t.byteSize} between 1 and 1048576`),
    check("privacy_exports_digest", sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "privacy_exports_review_binding",
      sql`(${t.encryptedReview} is null and ${t.reviewSha256} is null) or (${t.encryptedReview} is not null and ${t.reviewSha256} is not null and ${t.reviewSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check(
      "privacy_exports_issued",
      sql`${t.state} <> 'issued' or (${t.reviewedAt} is not null and ${t.reviewedById} is not null and ${t.expiresAt} is not null and ${t.issuedOperationId} is not null)`,
    ),
    check(
      "privacy_exports_coverage_binding",
      sql`not ${t.coverageComplete} or (${t.encryptedReview} is not null and ${t.reviewSha256} is not null and ${t.issuedOperationId} is not null)`,
    ),
    check(
      "privacy_exports_completion_binding",
      sql`${t.completedOperationId} is null or (${t.coverageComplete} and ${t.reviewSha256} is not null and ${t.issuedOperationId} is not null)`,
    ),
  ],
);
