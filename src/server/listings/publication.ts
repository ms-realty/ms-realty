// The minimal lawful publication path for S2 (spec §07.4, §07.7, F24, A31, A56, A66). Each
// step is a recorded human action by a named staff member holding the step's capability,
// idempotent through its operation id, with activity and audit written in its transaction:
//
//   confirm facts (listing.review_facts) -> submit for review (listing.edit, needs_facts ->
//   in_review) -> approve the exact version by its content hash (listing.review_facts,
//   in_review -> approved) -> release to the website (publication.release, never_published
//   -> publishing -> published, destination outcome verified by read-back).
//
// Nothing is approved on anyone's behalf: the AI service and system jobs can take none of
// these steps. The full review UI (O10-O17) is S4.
import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  approvals,
  facts as factsTable,
  listingSearchDocuments,
  listings,
  listingVersions,
  properties,
  publicationDestinationOutcomes,
  publicationReleases,
  translations,
} from "@/db/schema";
import {
  approvalCapability,
  canonicalJson,
  guardApprovalDecision,
  isApprovalValid,
} from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type { FactState, PropertyType, SourceClass } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { sourceLocale } from "@/domain/ids";
import {
  type DistributionEvidence,
  distributionTransitions,
  type EditorialState,
  editorialTransitions,
} from "@/domain/listing";
import {
  decidedFactStates,
  type MissingFact,
  missingRequiredFacts,
} from "@/domain/listing-readiness";
import {
  type DestinationOutcome,
  type DistributionState,
  guardReleaseConfirmation,
  type ReleaseKind,
} from "@/domain/publication";
import type { TransitionSpec, VersionedRecord } from "@/domain/transition";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { assertCan, assertCanRead, type Resource } from "../authz";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { type OperationSuccess, runOperation } from "../operations";
import { nextReference } from "../references";
import { refreshSearchDocument } from "../search/projection";
import { executeTransition, type RecordStore, tableStore } from "../transitions";

export interface ListingCommand {
  /** A staff member: every step here is a human decision. */
  readonly actor: Actor;
  /** Idempotency key shared by every retry of this command. */
  readonly operationId: string;
  readonly reference: string;
  /** The listing record version the actor decided on. */
  readonly expectedVersion: number;
  readonly note?: string;
  readonly correlationId?: string;
  readonly now?: Date;
}

// Reading the working state.

export interface WorkingFact {
  readonly key: string;
  readonly state: FactState;
  readonly value: unknown;
  readonly sourceClass: SourceClass;
  readonly reviewed: boolean;
}

export interface ListingReadiness {
  readonly reference: string;
  readonly listingId: string;
  /** Listing record version, for the next command's expectedVersion. */
  readonly version: number;
  readonly editorialState: EditorialState;
  readonly distributionState: DistributionState;
  readonly commercialState: string;
  readonly currentVersionNumber: number;
  readonly publishedVersionNumber: number | null;
  readonly contentHash: string | null;
  readonly facts: readonly WorkingFact[];
  readonly missingFacts: readonly MissingFact[];
  /** The Bulgarian source text is legacy source text or was reviewed by a person. */
  readonly sourceTextReviewed: boolean;
}

type ListingRow = typeof listings.$inferSelect & { propertyType: PropertyType };

async function lockListing(tx: Executor, reference: string, lock: boolean): Promise<ListingRow> {
  const query = tx
    .select({ listing: listings, propertyType: properties.propertyType })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  const [row] = lock ? await query.for("update", { of: listings }) : await query;
  if (!row) throw new AppError("not_found");
  return { ...row.listing, propertyType: row.propertyType };
}

function resourceOf(listing: ListingRow): Resource {
  return { type: "listing", id: listing.id, propertyId: listing.propertyId };
}

async function currentVersion(tx: Executor, listing: ListingRow) {
  const [version] = await tx
    .select()
    .from(listingVersions)
    .where(
      and(
        eq(listingVersions.listingId, listing.id),
        eq(listingVersions.versionNumber, listing.currentVersionNumber),
      ),
    );
  if (!version) return null;
  // The stored hash must still describe the stored snapshot, or no approval can bind to it.
  if (sha256Hex(canonicalJson(version.snapshot)) !== version.contentHash) {
    throw new Error(`Listing version ${version.id} content does not match its hash.`);
  }
  return version;
}

async function workingFacts(tx: Executor, listing: ListingRow) {
  return tx
    .select()
    .from(factsTable)
    .where(or(eq(factsTable.listingId, listing.id), eq(factsTable.propertyId, listing.propertyId)));
}

function sourceTextReviewed(snapshot: unknown): boolean {
  const text = (snapshot as { text?: { humanReviewed?: unknown; title?: unknown } | null })?.text;
  return Boolean(text?.title) && text?.humanReviewed === true;
}

async function readiness(tx: Executor, listing: ListingRow): Promise<ListingReadiness> {
  const version = await currentVersion(tx, listing);
  const rows = await workingFacts(tx, listing);
  const records = rows.map((f) => ({
    fieldKey: f.fieldKey,
    state: f.state,
    sourceClass: f.sourceClass,
    reviewedAt: f.reviewedAt?.toISOString() ?? null,
  }));
  return {
    reference: listing.reference,
    listingId: listing.id,
    version: listing.version,
    editorialState: listing.editorialState,
    distributionState: listing.distributionState,
    commercialState: listing.commercialState,
    currentVersionNumber: listing.currentVersionNumber,
    publishedVersionNumber: listing.publishedVersionNumber,
    contentHash: version?.contentHash ?? null,
    facts: rows
      .map((f) => ({
        key: f.fieldKey,
        state: f.state,
        value: f.value,
        sourceClass: f.sourceClass,
        reviewed: Boolean(f.reviewedAt),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    missingFacts: missingRequiredFacts(listing.propertyType, records),
    sourceTextReviewed: version ? sourceTextReviewed(version.snapshot) : false,
  };
}

/** Staff view of what stands between a listing and review/publication (needs listing.read). */
export async function getListingReadiness(
  db: Executor,
  actor: Actor,
  reference: string,
): Promise<ListingReadiness> {
  const listing = await lockListing(db, reference, false);
  await assertCanRead(db, actor, "listing.read", resourceOf(listing));
  return readiness(db, listing);
}

// Command plumbing.

function denied(code: string, fieldErrors?: Record<string, string[]>): AppError {
  return new AppError("transition_denied", {
    detail: code,
    fieldErrors: { ...fieldErrors, listing: [code] },
  });
}

function conflict(listing: ListingRow): AppError {
  return new AppError("version_conflict", {
    current: {
      reference: listing.reference,
      version: listing.version,
      editorialState: listing.editorialState,
      distributionState: listing.distributionState,
      currentVersionNumber: listing.currentVersionNumber,
      publishedVersionNumber: listing.publishedVersionNumber,
    },
  });
}

interface StepContext {
  readonly tx: Transaction;
  readonly operationId: string;
  readonly listing: ListingRow;
  readonly now: Date;
}

function runListingCommand<T>(
  db: Executor,
  type: string,
  command: ListingCommand,
  body: Record<string, unknown>,
  fn: (ctx: StepContext) => Promise<T>,
): Promise<OperationSuccess<T>> {
  // A human decision: the AI service, system jobs and visitors never take these steps (A66).
  if (command.actor.kind !== "staff") return Promise.reject(new AppError("forbidden"));
  const reference = command.reference.trim().toUpperCase();
  return runOperation(
    db,
    {
      actor: command.actor,
      type,
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        type,
        reference,
        expectedVersion: command.expectedVersion,
        note: command.note ?? null,
        ...body,
      }),
      expectedVersion: command.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const listing = await lockListing(tx, reference, true);
      if (listing.version !== command.expectedVersion) throw conflict(listing);
      return fn({ tx, operationId, listing, now: command.now ?? new Date() });
    },
  );
}

const editorialStore = tableStore<EditorialState>(listings, {
  id: listings.id,
  version: listings.version,
  state: listings.editorialState,
  reference: listings.reference,
  propertyId: listings.propertyId,
});

const distributionStore = tableStore<DistributionState>(listings, {
  id: listings.id,
  version: listings.version,
  state: listings.distributionState,
  reference: listings.reference,
  propertyId: listings.propertyId,
});

async function transition<S extends string, E, R extends VersionedRecord<S>>(
  ctx: StepContext,
  command: ListingCommand,
  spec: TransitionSpec<S, E>,
  store: RecordStore<S, R>,
  expectedVersion: number,
  to: S,
  evidence: E,
  reason?: string,
): Promise<number> {
  const outcome = await executeTransition(ctx.tx, spec, store, {
    actor: command.actor,
    recordId: ctx.listing.id,
    expectedVersion,
    to,
    evidence,
    operationId: ctx.operationId,
    now: ctx.now,
    ...(reason ? { reason } : {}),
    ...(command.correlationId ? { correlationId: command.correlationId } : {}),
  });
  if (outcome.outcome === "denied") {
    throw outcome.code === "missing_capability" ? new AppError("forbidden") : denied(outcome.code);
  }
  if (outcome.outcome === "version_conflict") throw conflict(ctx.listing);
  return outcome.record.version;
}

async function bumpListing(
  tx: Transaction,
  listing: ListingRow,
  expectedVersion: number,
  changes: Partial<typeof listings.$inferInsert> = {},
): Promise<number> {
  const [row] = await tx
    .update(listings)
    .set({ ...changes, version: expectedVersion + 1 })
    .where(and(eq(listings.id, listing.id), eq(listings.version, expectedVersion)))
    .returning({ version: listings.version });
  if (!row) throw conflict(listing);
  return row.version;
}

function withNote(summary: string, note: string | undefined): string {
  return note ? `${summary} Note: ${note}` : summary;
}

// 1. Confirm imported facts.

export interface FactsConfirmed {
  readonly reference: string;
  readonly listingVersion: number;
  readonly confirmed: readonly string[];
  readonly alreadyConfirmed: readonly string[];
}

/**
 * Records that the staff member checked the named facts' current values. Only decided values
 * (known, not applicable, withheld) can be confirmed; an unknown stays unknown and needs a
 * sourced value instead, which is the listing editor's job (S4). Values are never changed here.
 */
export function confirmListingFacts(
  db: Executor,
  command: ListingCommand & { readonly fieldKeys: readonly string[] },
): Promise<OperationSuccess<FactsConfirmed>> {
  const keys = [...new Set(command.fieldKeys.map((k) => k.trim()).filter(Boolean))].sort();
  return runListingCommand(db, "listing.facts.confirm", command, { keys }, async (ctx) => {
    const { tx, listing, now } = ctx;
    await assertCan(tx, command.actor, "listing.review_facts", resourceOf(listing), now);
    if (keys.length === 0) {
      throw new AppError("validation_failed", { fieldErrors: { fieldKeys: ["required"] } });
    }
    const rows = await workingFacts(tx, listing);
    const fieldErrors: Record<string, string[]> = {};
    const toConfirm: typeof rows = [];
    const alreadyConfirmed: string[] = [];
    for (const key of keys) {
      const row = rows.find((f) => f.fieldKey === key);
      if (!row) fieldErrors[key] = ["fact_absent"];
      else if (!decidedFactStates.includes(row.state)) fieldErrors[key] = ["fact_not_decided"];
      else if (row.reviewedAt) alreadyConfirmed.push(key);
      else toConfirm.push(row);
    }
    if (Object.keys(fieldErrors).length) throw new AppError("validation_failed", { fieldErrors });

    for (const row of toConfirm) {
      await tx
        .update(factsTable)
        .set({ reviewedByStaffId: command.actor.id, reviewedAt: now, version: row.version + 1 })
        .where(and(eq(factsTable.id, row.id), eq(factsTable.version, row.version)));
    }
    const confirmed = toConfirm.map((r) => r.fieldKey);
    // The listing's facts changed: decisions taken on the old version must be retaken.
    const listingVersion = confirmed.length
      ? await bumpListing(tx, listing, listing.version)
      : listing.version;
    if (confirmed.length) {
      await recordActivity(tx, {
        recordType: "listing",
        recordId: listing.id,
        reference: listing.reference,
        messageKey: "activity.listing.facts_confirmed",
        params: { keys: confirmed },
        summary: withNote(
          `Facts of ${listing.reference} confirmed by staff: ${confirmed.join(", ")}.`,
          command.note,
        ),
        actor: command.actor,
        operationId: ctx.operationId,
        at: now,
      });
      await recordAudit(tx, {
        action: "listing.facts.confirm",
        actor: command.actor,
        capability: "listing.review_facts",
        recordType: "listing",
        recordId: listing.id,
        operationId: ctx.operationId,
        ...(command.correlationId ? { correlationId: command.correlationId } : {}),
        payload: {
          facts: toConfirm.map((r) => ({ id: r.id, key: r.fieldKey, state: r.state })),
          expectedVersion: listing.version,
          newVersion: listingVersion,
        },
        at: now,
      });
    }
    return { reference: listing.reference, listingVersion, confirmed, alreadyConfirmed };
  });
}

// 2. Submit for review.

export interface ListingStepResult {
  readonly reference: string;
  readonly listingVersion: number;
  readonly editorialState: EditorialState;
  readonly distributionState: DistributionState;
}

function missingErrors(ready: ListingReadiness): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const m of ready.missingFacts) errors[`fact.${m.key}`] = [m.problem];
  if (!ready.sourceTextReviewed) errors["text.bg"] = ["unreviewed"];
  return errors;
}

/** needs_facts/draft/changes_requested -> in_review; refused while required facts are missing. */
export function submitListingForReview(
  db: Executor,
  command: ListingCommand,
): Promise<OperationSuccess<ListingStepResult>> {
  return runListingCommand(db, "listing.submit_for_review", command, {}, async (ctx) => {
    const ready = await readiness(ctx.tx, ctx.listing);
    const missing = missingErrors(ready);
    const count = Object.keys(missing).length;
    if (count > 0) throw denied("required_facts_missing", missing);
    const listingVersion = await transition(
      ctx,
      command,
      editorialTransitions,
      editorialStore,
      ctx.listing.version,
      "in_review",
      { missingRequiredFacts: count },
      command.note,
    );
    return {
      reference: ctx.listing.reference,
      listingVersion,
      editorialState: "in_review",
      distributionState: ctx.listing.distributionState,
    };
  });
}

// 3. Approve the exact version.

export interface VersionApproved extends ListingStepResult {
  readonly approvalId: string;
  readonly versionNumber: number;
  readonly contentHash: string;
}

async function insertApproval(
  tx: Transaction,
  values: {
    kind: "factual" | "publication";
    subjectId: string;
    subjectVersion: number;
    subjectHash: string;
    scope: Record<string, unknown>;
    actor: Actor;
    note: string | undefined;
    now: Date;
    operationId: string;
    correlationId: string | undefined;
  },
): Promise<string> {
  const decision = guardApprovalDecision(
    {
      kind: values.kind,
      subject: {
        type: "listing_version",
        id: values.subjectId,
        version: values.subjectVersion,
        hash: values.subjectHash,
      },
      state: "pending",
    },
    "approved",
    { actor: values.actor, currentHash: values.subjectHash },
  );
  if (decision.outcome === "denied") throw denied(decision.code);
  const capability = approvalCapability[values.kind];
  const [row] = await tx
    .insert(approvals)
    .values({
      kind: values.kind,
      state: "approved",
      subjectType: "listing_version",
      subjectId: values.subjectId,
      subjectVersion: values.subjectVersion,
      subjectHash: values.subjectHash,
      scope: values.scope,
      requestedByKind: values.actor.kind,
      requestedById: values.actor.id,
      decidedByKind: values.actor.kind,
      decidedById: values.actor.id,
      decidedWithCapability: capability,
      decidedAt: values.now,
      decisionNote: values.note ?? null,
    })
    .returning({ id: approvals.id });
  if (!row) throw new Error("Approval insert returned no row.");
  await recordAudit(tx, {
    action: "approval.decide",
    actor: values.actor,
    capability,
    recordType: "approval",
    recordId: row.id,
    operationId: values.operationId,
    ...(values.correlationId ? { correlationId: values.correlationId } : {}),
    payload: {
      kind: values.kind,
      decision: "approved",
      subject: {
        type: "listing_version",
        id: values.subjectId,
        version: values.subjectVersion,
        hash: values.subjectHash,
      },
      scope: values.scope,
    },
    at: values.now,
  });
  return row.id;
}

/**
 * Factual approval of one listing version, bound to its content hash, then in_review ->
 * approved. The caller names the version and hash it reviewed; any other content conflicts.
 */
export function approveListingVersion(
  db: Executor,
  command: ListingCommand & { readonly versionNumber: number; readonly contentHash: string },
): Promise<OperationSuccess<VersionApproved>> {
  const body = { versionNumber: command.versionNumber, contentHash: command.contentHash };
  return runListingCommand(db, "listing.approve_version", command, body, async (ctx) => {
    const { tx, listing, now } = ctx;
    await assertCan(tx, command.actor, approvalCapability.factual, resourceOf(listing), now);
    const version = await currentVersion(tx, listing);
    if (
      !version ||
      version.versionNumber !== command.versionNumber ||
      version.contentHash !== command.contentHash
    ) {
      throw conflict(listing);
    }
    const approvalId = await insertApproval(tx, {
      kind: "factual",
      subjectId: version.id,
      subjectVersion: version.versionNumber,
      subjectHash: version.contentHash,
      scope: { listingReference: listing.reference, locale: sourceLocale },
      actor: command.actor,
      note: command.note,
      now,
      operationId: ctx.operationId,
      correlationId: command.correlationId,
    });
    const listingVersion = await transition(
      ctx,
      command,
      editorialTransitions,
      editorialStore,
      listing.version,
      "approved",
      { approvalValid: true },
      command.note,
    );
    return {
      reference: listing.reference,
      listingVersion,
      editorialState: "approved",
      distributionState: listing.distributionState,
      approvalId,
      versionNumber: version.versionNumber,
      contentHash: version.contentHash,
    };
  });
}

// 4. Release to the website, and withdraw from it.

export interface ReleaseResult extends ListingStepResult {
  readonly releaseReference: string;
  readonly releaseKind: ReleaseKind;
  readonly versionNumber: number | null;
  readonly searchDocument: "written" | "removed";
}

async function validApproval(
  tx: Transaction,
  kinds: readonly (typeof approvals.$inferSelect)["kind"][],
  versionId: string,
  hash: string,
): Promise<boolean> {
  const rows = await tx
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.subjectType, "listing_version"),
        eq(approvals.subjectId, versionId),
        inArray(approvals.kind, [...kinds]),
      ),
    );
  return rows.some((a) =>
    isApprovalValid(
      {
        kind: a.kind,
        state: a.state,
        subject: {
          type: a.subjectType,
          id: a.subjectId,
          version: a.subjectVersion,
          hash: a.subjectHash,
        },
      },
      hash,
    ),
  );
}

async function openRelease(
  ctx: StepContext,
  command: ListingCommand,
  kind: ReleaseKind,
  versionNumber: number,
  locales: readonly PublicLocale[],
  approvalId: string,
  translationIds: Record<string, string>,
) {
  const reference = await nextReference(ctx.tx, "publication_release", ctx.now);
  const [release] = await ctx.tx
    .insert(publicationReleases)
    .values({
      reference,
      kind,
      subjectType: "listing",
      subjectId: ctx.listing.id,
      subjectVersionNumber: versionNumber,
      locales: [...locales],
      state: kind === "withdraw" ? "withdrawing" : "publishing",
      confirmedByStaffId: command.actor.id,
      approvalId,
      translationIds,
    })
    .returning({ id: publicationReleases.id });
  if (!release) throw new Error("Release insert returned no row.");
  const outcomes = await ctx.tx
    .insert(publicationDestinationOutcomes)
    .values(
      locales.map((locale) => ({
        releaseId: release.id,
        destination: "website" as const,
        locale,
        state: "requested" as const,
        attempt: 1,
        requestedAt: ctx.now,
      })),
    )
    .returning({
      id: publicationDestinationOutcomes.id,
      destination: publicationDestinationOutcomes.destination,
      locale: publicationDestinationOutcomes.locale,
      state: publicationDestinationOutcomes.state,
    });
  return { id: release.id, reference, outcomes };
}

/**
 * Records what the website destination now serves. The website reads this database, so
 * acknowledgment and read-back happen here: an outcome is verified only when reading back
 * shows exactly the released state.
 */
async function settleWebsiteOutcomes(
  ctx: StepContext,
  release: { id: string; outcomes: { id: string }[] },
  expectLive: number | null,
): Promise<DestinationOutcome[]> {
  const [served] = await ctx.tx
    .select({ published: listings.publishedVersionNumber })
    .from(listings)
    .where(eq(listings.id, ctx.listing.id));
  const [document] = await ctx.tx
    .select({ id: listingSearchDocuments.listingId })
    .from(listingSearchDocuments)
    .where(eq(listingSearchDocuments.listingId, ctx.listing.id));
  const verified = served?.published === expectLive && Boolean(document) === (expectLive !== null);
  const rows = await ctx.tx
    .update(publicationDestinationOutcomes)
    .set(
      verified
        ? { state: "verified", acknowledgedAt: ctx.now, verifiedAt: ctx.now }
        : { state: "failed", failedAt: ctx.now, errorCode: "read_back_mismatch" },
    )
    .where(
      inArray(
        publicationDestinationOutcomes.id,
        release.outcomes.map((o) => o.id),
      ),
    )
    .returning({
      destination: publicationDestinationOutcomes.destination,
      locale: publicationDestinationOutcomes.locale,
      state: publicationDestinationOutcomes.state,
    });
  return rows;
}

const liveStates: readonly DistributionState[] = ["published", "partially_published", "failed"];

/**
 * Releases the approved current version to the website: a publication approval, a release
 * with per-locale website outcomes, the listing's published version and its search document.
 * Needs the factual approval and the owner's (or recorded legacy owner) approval of the same
 * content hash; locales are the source plus translations approved for this version.
 */
export function publishListing(
  db: Executor,
  command: ListingCommand & { readonly versionNumber: number },
): Promise<OperationSuccess<ReleaseResult>> {
  const body = { versionNumber: command.versionNumber };
  return runListingCommand(db, "listing.publish", command, body, async (ctx) => {
    const { tx, listing, now } = ctx;
    await assertCan(tx, command.actor, "publication.release", resourceOf(listing), now);
    if (listing.editorialState !== "approved") throw denied("editorial_not_approved");
    const version = await currentVersion(tx, listing);
    if (!version || version.versionNumber !== command.versionNumber) throw conflict(listing);
    const live = liveStates.includes(listing.distributionState);
    if (live && listing.publishedVersionNumber === version.versionNumber) {
      throw denied("already_published");
    }

    const approvedTranslations = await tx
      .select({ id: translations.id, locale: translations.locale })
      .from(translations)
      .where(
        and(
          eq(translations.subjectType, "listing"),
          eq(translations.subjectId, listing.id),
          eq(translations.sourceVersion, version.versionNumber),
          eq(translations.state, "approved"),
        ),
      );
    const locales: PublicLocale[] = [sourceLocale, ...approvedTranslations.map((t) => t.locale)];
    const decision = guardReleaseConfirmation(
      {
        factualApprovalValid: await validApproval(tx, ["factual"], version.id, version.contentHash),
        ownerApprovalValid: await validApproval(
          tx,
          ["owner_instruction", "legacy_owner_publication_approval"],
          version.id,
          version.contentHash,
        ),
        currentSourceVersion: version.versionNumber,
        locales: [
          { locale: sourceLocale },
          ...approvedTranslations.map((t) => ({
            locale: t.locale,
            translationState: "approved" as const,
            translationSourceVersion: version.versionNumber,
          })),
        ],
        // Only cleared, reviewed, disclosed media is ever served (src/server/media); media
        // still in staging is not part of what the website shows, so it cannot block.
        mediaAllPublishable: true,
        destinations: ["website"],
      },
      command.actor,
    );
    if (decision.outcome === "denied") throw denied(decision.code);

    const kind: ReleaseKind = live ? "correction" : "publish";
    const approvalId = await insertApproval(tx, {
      kind: "publication",
      subjectId: version.id,
      subjectVersion: version.versionNumber,
      subjectHash: version.contentHash,
      scope: { releaseKind: kind, destinations: ["website"], locales },
      actor: command.actor,
      note: command.note,
      now,
      operationId: ctx.operationId,
      correlationId: command.correlationId,
    });
    const release = await openRelease(
      ctx,
      command,
      kind,
      version.versionNumber,
      locales,
      approvalId,
      Object.fromEntries(approvedTranslations.map((t) => [t.locale, t.id])),
    );
    const reason = withNote(`Release ${release.reference}.`, command.note);
    const releaseEvidence = (outcomes: DestinationOutcome[]): DistributionEvidence => ({
      release: { id: release.id, kind, outcomes },
    });

    let listingVersion = await transition(
      ctx,
      command,
      distributionTransitions,
      distributionStore,
      listing.version,
      "publishing",
      releaseEvidence(release.outcomes),
      reason,
    );
    listingVersion = await bumpListing(tx, listing, listingVersion, {
      publishedVersionNumber: version.versionNumber,
    });
    const searchDocument = await refreshSearchDocument(tx, listing.id);
    const outcomes = await settleWebsiteOutcomes(ctx, release, version.versionNumber);
    const to: DistributionState = outcomes.every((o) => o.state === "verified")
      ? "published"
      : "failed";
    listingVersion = await transition(
      ctx,
      command,
      distributionTransitions,
      distributionStore,
      listingVersion,
      to,
      releaseEvidence(outcomes),
      reason,
    );
    await tx
      .update(publicationReleases)
      .set({ state: to })
      .where(eq(publicationReleases.id, release.id));
    return {
      reference: listing.reference,
      listingVersion,
      editorialState: listing.editorialState,
      distributionState: to,
      releaseReference: release.reference,
      releaseKind: kind,
      versionNumber: version.versionNumber,
      searchDocument,
    };
  });
}

/** Takes the listing off the website and out of search; history and records stay. */
export function withdrawListingPublication(
  db: Executor,
  command: ListingCommand & { readonly reason: string },
): Promise<OperationSuccess<ReleaseResult>> {
  const body = { reason: command.reason };
  return runListingCommand(db, "listing.withdraw_publication", command, body, async (ctx) => {
    const { tx, listing, now } = ctx;
    await assertCan(tx, command.actor, "publication.release", resourceOf(listing), now);
    if (!command.reason.trim()) {
      throw new AppError("validation_failed", { fieldErrors: { reason: ["required"] } });
    }
    const publishedVersion = listing.publishedVersionNumber;
    if (!liveStates.includes(listing.distributionState) || publishedVersion === null) {
      throw denied("not_published");
    }
    const [version] = await tx
      .select()
      .from(listingVersions)
      .where(
        and(
          eq(listingVersions.listingId, listing.id),
          eq(listingVersions.versionNumber, publishedVersion),
        ),
      );
    if (!version) throw new Error(`Published version ${publishedVersion} is missing.`);
    const locales: PublicLocale[] = [sourceLocale];
    const approvalId = await insertApproval(tx, {
      kind: "publication",
      subjectId: version.id,
      subjectVersion: version.versionNumber,
      subjectHash: version.contentHash,
      scope: { releaseKind: "withdraw", destinations: ["website"], locales },
      actor: command.actor,
      note: command.reason,
      now,
      operationId: ctx.operationId,
      correlationId: command.correlationId,
    });
    const release = await openRelease(
      ctx,
      command,
      "withdraw",
      publishedVersion,
      locales,
      approvalId,
      {},
    );
    const reason = withNote(`Withdrawal ${release.reference}: ${command.reason}`, command.note);
    const releaseEvidence = (outcomes: DestinationOutcome[]): DistributionEvidence => ({
      release: { id: release.id, kind: "withdraw", outcomes },
    });

    let listingVersion = await transition(
      ctx,
      command,
      distributionTransitions,
      distributionStore,
      listing.version,
      "withdrawing",
      releaseEvidence(release.outcomes),
      reason,
    );
    listingVersion = await bumpListing(tx, listing, listingVersion, {
      publishedVersionNumber: null,
    });
    const searchDocument = await refreshSearchDocument(tx, listing.id);
    const outcomes = await settleWebsiteOutcomes(ctx, release, null);
    const to: DistributionState = outcomes.every((o) => o.state === "verified")
      ? "withdrawn"
      : "published";
    listingVersion = await transition(
      ctx,
      command,
      distributionTransitions,
      distributionStore,
      listingVersion,
      to,
      releaseEvidence(outcomes),
      reason,
    );
    await tx
      .update(publicationReleases)
      .set({ state: to })
      .where(eq(publicationReleases.id, release.id));
    return {
      reference: listing.reference,
      listingVersion,
      editorialState: listing.editorialState,
      distributionState: to,
      releaseReference: release.reference,
      releaseKind: "withdraw",
      versionNumber: null,
      searchDocument,
    };
  });
}
