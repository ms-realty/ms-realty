// O16PUB: recorded review decisions for one chosen immutable publication manifest (§7.2).
// This read confers no publishing authority; activation still rechecks current eligibility.
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  approvals,
  listingRevisions,
  listings,
  principals,
  propertyFactRevisions,
  publicationManifests,
  staffMemberships,
} from "@/db/schema";
import type { ApprovalState, ApprovalSubject } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import { assertCanRead } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";

type ApprovalRow = typeof approvals.$inferSelect;
type PrincipalRow = typeof principals.$inferSelect;

export interface RecordedReviewDecider {
  readonly kind: NonNullable<ApprovalRow["decidedByKind"]>;
  readonly id: string;
  /** Current directory name, not a name snapshot from the decision time. */
  readonly displayName: string | null;
  readonly identityState: "resolved" | "missing" | "kind_mismatch";
  readonly principalStatus: PrincipalRow["status"] | null;
  readonly staffMembershipState: typeof staffMemberships.$inferSelect.state | null;
}

export type PublicationReviewDecision =
  | {
      readonly binding: "matched";
      readonly approvalId: string;
      /** Recorded state; an invalidated/expired decision remains part of the history. */
      readonly state: ApprovalState;
      readonly subject: ApprovalSubject;
      readonly scope: unknown;
      readonly decidedAt: Date | null;
      readonly decider: RecordedReviewDecider | null;
      readonly expiresAt: Date | null;
      readonly invalidatedAt: Date | null;
      readonly invalidationReason: string | null;
    }
  | {
      readonly binding: "missing" | "mismatched";
      readonly approvalId: string | null;
    };

export interface PublicationReviewActors {
  readonly reference: string;
  readonly listingId: string;
  readonly manifestId: string;
  readonly locale: PublicLocale;
  readonly factual: PublicationReviewDecision;
  readonly editorial: PublicationReviewDecision;
}

// JSON decision IDs and legacy actor IDs are not protected by a UUID foreign key.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff-only, listing/locale-scoped history for the exact requested manifest. Resolve only
 * its stored factual/editorial decision IDs; never substitute a newer approval, the author,
 * manifest creator or publisher. A matched binding is not a current approval or release gate.
 */
export async function publicationReviewActors(
  db: Executor,
  actor: Actor,
  input: { readonly reference: string; readonly manifestId: string },
): Promise<PublicationReviewActors> {
  if (actor.kind !== "staff" || !uuid.test(input.manifestId)) throw new AppError("not_found");
  const [chosen] = await db
    .select({
      manifest: publicationManifests,
      reference: listings.reference,
      propertyId: listings.propertyId,
      facts: {
        version: propertyFactRevisions.revisionNumber,
        hash: propertyFactRevisions.contentDigest,
      },
      revision: {
        version: listingRevisions.revisionNumber,
        hash: listingRevisions.contentDigest,
      },
    })
    .from(publicationManifests)
    .innerJoin(listings, eq(listings.id, publicationManifests.listingId))
    .innerJoin(
      listingRevisions,
      and(
        eq(listingRevisions.id, publicationManifests.listingRevisionId),
        eq(listingRevisions.listingId, listings.id),
        eq(listingRevisions.factRevisionId, publicationManifests.factRevisionId),
      ),
    )
    .innerJoin(
      propertyFactRevisions,
      and(
        eq(propertyFactRevisions.id, publicationManifests.factRevisionId),
        eq(propertyFactRevisions.propertyId, listings.propertyId),
      ),
    )
    .where(
      and(
        eq(publicationManifests.id, input.manifestId),
        eq(listings.reference, input.reference.trim().toUpperCase()),
      ),
    );
  if (!chosen) throw new AppError("not_found");
  await assertCanRead(db, actor, "listing.read", {
    type: "listing",
    id: chosen.manifest.listingId,
    propertyId: chosen.propertyId,
    locale: chosen.manifest.locale,
    audience: "internal",
  });

  const decisions = chosen.manifest.decisions;
  const decisionId = (kind: "factual" | "editorial"): string | null => {
    if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) return null;
    const id = (decisions as Record<string, unknown>)[kind];
    return typeof id === "string" && id.length > 0 ? id : null;
  };
  const factualId = decisionId("factual");
  const editorialId = decisionId("editorial");
  const ids = [factualId, editorialId].filter((id): id is string => id !== null && uuid.test(id));
  const rows = ids.length
    ? await db
        .select({
          approval: approvals,
          principal: {
            kind: principals.kind,
            displayName: principals.displayName,
            status: principals.status,
          },
          membershipState: staffMemberships.state,
        })
        .from(approvals)
        // Cast the directory ID, not the recorded actor: malformed/missing historical IDs
        // must leave the recorded decision readable without attributing it to another person.
        .leftJoin(principals, eq(sql<string>`${principals.id}::text`, approvals.decidedById))
        .leftJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
        .where(inArray(approvals.id, ids))
    : [];

  function review(
    kind: "factual" | "editorial",
    approvalId: string | null,
    subject: ApprovalSubject,
  ): PublicationReviewDecision {
    const row = rows.find((r) => r.approval.id === approvalId?.toLowerCase());
    if (!row) return { binding: "missing", approvalId };
    const approval = row.approval;
    if (
      approval.kind !== kind ||
      approval.subjectType !== subject.type ||
      approval.subjectId !== subject.id ||
      approval.subjectVersion !== subject.version ||
      approval.subjectHash !== subject.hash
    ) {
      // Never return identity or other approval details from an unrelated subject.
      return { binding: "mismatched", approvalId };
    }
    const identityState = !row.principal
      ? "missing"
      : row.principal.kind !== approval.decidedByKind
        ? "kind_mismatch"
        : "resolved";
    return {
      binding: "matched",
      approvalId: approval.id,
      state: approval.state,
      subject,
      scope: approval.scope,
      decidedAt: approval.decidedAt,
      decider:
        approval.decidedByKind && approval.decidedById
          ? {
              kind: approval.decidedByKind,
              id: approval.decidedById,
              displayName:
                identityState === "resolved" ? (row.principal?.displayName ?? null) : null,
              identityState,
              principalStatus:
                identityState === "resolved" ? (row.principal?.status ?? null) : null,
              staffMembershipState:
                identityState === "resolved" && approval.decidedByKind === "staff"
                  ? row.membershipState
                  : null,
            }
          : null,
      expiresAt: approval.expiresAt,
      invalidatedAt: approval.invalidatedAt,
      invalidationReason: approval.invalidationReason,
    };
  }

  return {
    reference: chosen.reference,
    listingId: chosen.manifest.listingId,
    manifestId: chosen.manifest.id,
    locale: chosen.manifest.locale,
    factual: review("factual", factualId, {
      type: "property_fact_revision",
      id: chosen.manifest.factRevisionId,
      ...chosen.facts,
    }),
    editorial: review("editorial", editorialId, {
      type: "listing_revision",
      id: chosen.manifest.listingRevisionId,
      ...chosen.revision,
    }),
  };
}
