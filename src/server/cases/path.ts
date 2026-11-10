// The Deal path read model and its staff commands (ADR 0013). Early steps are derived from the
// Case's existing records; later steps are recorded by a person. Completing the last step lets
// the broker close the Deal with a verified, structured outcome. Nothing here moves money,
// signs anything or decides a legal question: it records what people did.
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, min, sql } from "drizzle-orm";
import { z } from "zod";
import type { DealPathActor, DealPathDuty, DealPathTransaction } from "@/config/tenant";
import { agencyTimeZone } from "@/config/tenant";
import {
  appointments,
  briefRevisions,
  caseCompletions,
  casePathSteps,
  caseStageHistory,
  cases,
  documents,
  documentVersions,
  inquiries,
  interests,
  listings,
  properties,
  proposalRevisions,
  proposals,
} from "@/db/schema";
import { type CaseStage, caseStageTransitions, dispositionTransitions } from "@/domain/case";
import {
  type AgreedTerms,
  type BrokerageDetails,
  calendarDate,
  completionReadiness,
  composePath,
  type DerivedFacts,
  dealCompletedOutcome,
  dealTransaction,
  derivedSteps,
  dutyInScope,
  isCalendarDate,
  nextRecordedState,
  type PathStepAction,
  type PathStepBase,
  pathStepActions,
  previewSteps,
  type RecordedStepInput,
  type RecordedStepState,
  recordedSteps,
  resolveTemplate,
  stepDutyBlock,
  stepKeyPattern,
  templateStep,
  templateSteps,
  withdrawalEndsOn,
} from "@/domain/deal-path";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess } from "../files/access";
import { recordListingOutcome } from "../listings/commercial";
import { runOperation } from "../operations";
import { termsDigest } from "../proposals/shared";
import { allow, commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import { assertResolved, lifecycleCase } from "./lifecycle";
import { bumpCase, caseEvent, caseFor } from "./shared";

type CaseRow = typeof cases.$inferSelect;
type StepRow = typeof casePathSteps.$inferSelect;

const terminalStage = (kind: CaseRow["kind"]): CaseStage | null =>
  kind === "buyer" || kind === "tenant"
    ? "completed"
    : kind === "seller" || kind === "landlord"
      ? "completion_handover"
      : null;

/** What the Case's existing records say, plus the property country the template follows. */
async function pathFacts(db: Executor, row: CaseRow) {
  const [request] = await db
    .select({ at: min(inquiries.createdAt) })
    .from(inquiries)
    .where(eq(inquiries.caseId, row.id));
  const [brief] = await db
    .select({ at: min(briefRevisions.clientAcknowledgedAt) })
    .from(briefRevisions)
    .where(and(eq(briefRevisions.caseId, row.id), isNotNull(briefRevisions.brokerAcknowledgedAt)));
  const [shortlisted] = await db
    .select({ id: interests.id })
    .from(interests)
    .where(
      and(
        eq(interests.caseId, row.id),
        inArray(interests.state, ["shortlisted", "viewing_requested", "viewed", "proposal"]),
      ),
    )
    .limit(1);
  const viewings = await db
    .select({
      state: appointments.state,
      startsAt: appointments.confirmedStartsAt,
      endsAt: appointments.confirmedEndsAt,
    })
    .from(appointments)
    .where(and(eq(appointments.caseId, row.id), eq(appointments.purpose, "viewing")));
  const now = new Date();
  const doneViewings = viewings
    .filter((v) => v.state === "completed")
    .map((v) => v.endsAt ?? v.startsAt)
    .filter((at): at is Date => Boolean(at))
    .sort((a, b) => a.getTime() - b.getTime());
  const upcoming = viewings
    .filter((v) => v.state === "confirmed" && v.startsAt && v.startsAt > now)
    .map((v) => v.startsAt as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  const offers = await db
    .select({
      revision: proposalRevisions,
      country: properties.country,
      listingId: proposals.listingId,
    })
    .from(proposals)
    .innerJoin(
      proposalRevisions,
      and(
        eq(proposalRevisions.proposalId, proposals.id),
        eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
      ),
    )
    .innerJoin(listings, eq(listings.id, proposals.listingId))
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(eq(proposals.caseId, row.id))
    .orderBy(desc(proposals.createdAt), asc(proposals.id));
  // Only the exact agreed terms count; a revision whose terms changed after agreement does not.
  const agreed = offers.find(
    (o) =>
      o.revision.state === "agreed_for_next_step" &&
      o.revision.termsHash === termsDigest(o.revision),
  );
  const [interestCountry] = agreed
    ? []
    : await db
        .select({ country: properties.country })
        .from(interests)
        .innerJoin(listings, eq(listings.id, interests.listingId))
        .innerJoin(properties, eq(properties.id, listings.propertyId))
        .where(eq(interests.caseId, row.id))
        .orderBy(desc(interests.createdAt))
        .limit(1);
  const facts: DerivedFacts = {
    requestReceivedAt: request?.at ?? row.createdAt,
    briefAgreedAt: brief?.at ?? null,
    shortlisted: Boolean(shortlisted),
    viewingDoneAt: doneViewings.at(-1) ?? null,
    viewingExpectedAt: upcoming[0] ?? null,
    termsAgreedAt: agreed ? (agreed.revision.respondedAt ?? agreed.revision.updatedAt) : null,
  };
  const country = agreed?.country ?? offers[0]?.country ?? interestCountry?.country ?? null;
  return {
    facts,
    country,
    agreedRevisionId: agreed?.revision.id ?? null,
    agreedListingId: agreed?.listingId ?? null,
    agreedTerms: agreed
      ? {
          amountMinor: agreed.revision.amountMinor,
          currency: agreed.revision.currency,
          period: agreed.revision.period,
        }
      : null,
  };
}

const brokerageDetailsSchema = z.object({
  away: z.boolean(),
  earlyStart: z.boolean().nullable(),
});

/** The duty state of a stored path (ADR 0015): what is blocked and whether a duty is open. */
function pathDuties(
  stored: readonly StepRow[],
  transaction: DealPathTransaction,
  terms: AgreedTerms | null,
) {
  const identity = stored.find(
    (s) => templateStep(s.template, s.stepKey)?.duty === "customer_due_diligence",
  );
  const identityChecks = (identity?.state as RecordedStepState | undefined) ?? null;
  const dutyOpen = stored.some((s) => {
    const duty = templateStep(s.template, s.stepKey)?.duty;
    return duty && dutyInScope(duty, transaction, terms) && s.state !== "done";
  });
  const block = (row: StepRow, action: PathStepAction) =>
    stepDutyBlock({
      step: templateStep(row.template, row.stepKey),
      action,
      transaction,
      terms,
      identityChecks,
    });
  return { identityChecks, dutyOpen, block };
}

const stepInput = (row: StepRow): RecordedStepInput => ({
  key: row.stepKey,
  actor: row.actor as DealPathActor,
  evidenceExpected: row.evidenceExpected,
  clientVisible: row.clientVisible,
  state: row.state as RecordedStepState,
  expectedOn: row.expectedOn,
  doneOn: row.doneOn,
});

async function storedSteps(db: Executor, caseId: string, lock = false) {
  const query = db
    .select()
    .from(casePathSteps)
    .where(eq(casePathSteps.caseId, caseId))
    .orderBy(asc(casePathSteps.position));
  return lock ? query.for("update") : query;
}

/**
 * Record the Case's steps from its template if none are recorded yet: when terms are agreed, or
 * on the first staff action. Idempotent under concurrency; the first writer's template wins.
 */
export async function ensureCasePath(db: Executor, caseId: string) {
  const existing = await storedSteps(db, caseId, true);
  if (existing.length) return existing;
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!row) throw new AppError("not_found");
  const transaction = dealTransaction(row.kind);
  if (!transaction) return existing;
  const { country } = await pathFacts(db, row);
  const template = resolveTemplate(country, transaction);
  await db
    .insert(casePathSteps)
    .values(
      template.steps.map((step, position) => ({
        caseId,
        template: template.key,
        stepKey: step.key,
        position,
        actor: step.actor,
        evidenceExpected: step.evidence,
        clientVisible: step.clientVisible,
      })),
    )
    .onConflictDoNothing();
  return storedSteps(db, caseId, true);
}

export type CasePathStep = PathStepBase & {
  readonly status: ReturnType<typeof composePath>["steps"][number]["status"];
  readonly clientNote: string | null;
  /** Staff with internal access only. */
  readonly internalNote?: string | null;
  readonly skipReason?: string | null;
  readonly evidence?: { readonly versionId: string; readonly fileName: string } | null;
  /** The agency duty this step records (ADR 0015), if any. */
  readonly duty?: DealPathDuty;
  /** Staff: the step may be marked not needed (false for an in-scope duty). */
  readonly canSkip?: boolean;
  /** Staff: the step moves money, a signature or the property and waits for identity checks. */
  readonly waitsForIdentityChecks?: boolean;
  /** Staff: what was recorded with a done brokerage contract step. */
  readonly brokerage?: (BrokerageDetails & { readonly withdrawalEndsOn: string | null }) | null;
};

/**
 * The path one reader may see. A client participant gets only client-visible steps and notes on
 * a Deal they can access; anyone else gets not found. Staff see internal notes only with
 * `case.read_internal`. Service-intake Cases have no path (null).
 */
export async function casePath(db: Executor, session: Session, caseId: string) {
  const { row, live, resource } = await caseFor(db, session, caseId);
  const transaction = dealTransaction(row.kind);
  if (!transaction) return null;
  const staff = live.account.kind === "staff";
  const internal = staff && (await can(db, live.actor, "case.read_internal", resource));
  const canTransition = staff && (await can(db, live.actor, "case.transition", resource));
  const { facts, country, agreedTerms } = await pathFacts(db, row);
  const stored = await storedSteps(db, row.id);
  const template = stored[0]?.template ?? resolveTemplate(country, transaction).key;
  const duties = pathDuties(stored, transaction, agreedTerms);
  const rows = stored.length ? stored.map(stepInput) : previewSteps(templateSteps(template) ?? []);
  const evidenceIds = stored.flatMap((s) => (s.evidenceVersionId ? [s.evidenceVersionId] : []));
  const files =
    internal && evidenceIds.length
      ? await db
          .select({ id: documentVersions.id, fileName: documentVersions.fileName })
          .from(documentVersions)
          .where(inArray(documentVersions.id, evidenceIds))
      : [];
  const byKey = new Map(stored.map((s) => [s.stepKey, s]));
  // A preview (nothing stored yet) reads its template's identity checks as still to do.
  const identityState =
    rows.find((r) => templateStep(template, r.key)?.duty === "customer_due_diligence")?.state ??
    null;
  const base = [...derivedSteps(row.kind, facts), ...recordedSteps(rows)].map((step) => {
    const record = step.source === "recorded" ? byKey.get(step.key) : undefined;
    const evidence = record?.evidenceVersionId
      ? (files.find((f) => f.id === record.evidenceVersionId) ?? null)
      : null;
    const definition = step.source === "recorded" ? templateStep(template, step.key) : undefined;
    const brokerage =
      definition?.duty === "brokerage_contract" && record?.state === "done"
        ? brokerageDetailsSchema.safeParse(record.details)
        : null;
    return {
      ...step,
      clientNote: record?.clientNote ?? null,
      ...(definition?.duty ? { duty: definition.duty } : {}),
      ...(internal
        ? {
            internalNote: record?.internalNote ?? null,
            skipReason: record?.skipReason ?? null,
            evidence: evidence ? { versionId: evidence.id, fileName: evidence.fileName } : null,
            canSkip: !(definition?.duty && dutyInScope(definition.duty, transaction, agreedTerms)),
            waitsForIdentityChecks: Boolean(
              definition?.afterIdentityChecks && identityState === "pending",
            ),
            brokerage:
              brokerage?.success && record?.doneOn
                ? {
                    ...brokerage.data,
                    withdrawalEndsOn: brokerage.data.away ? withdrawalEndsOn(record.doneOn) : null,
                  }
                : null,
          }
        : {}),
    };
  });
  const composed = composePath(base, staff ? "staff" : "client");
  const completedDeal = row.disposition === "closed" && row.closureOutcome === dealCompletedOutcome;
  const [completion] = completedDeal
    ? await db
        .select({
          completedOn: caseCompletions.completedOn,
          registryReference: caseCompletions.registryReference,
          evidenceVersionId: caseCompletions.evidenceVersionId,
          createdAt: caseCompletions.createdAt,
        })
        .from(caseCompletions)
        .where(eq(caseCompletions.caseId, row.id))
        .orderBy(desc(caseCompletions.createdAt))
        .limit(1)
    : [];
  const readiness = completionReadiness(facts, stored.map(stepInput), duties.dutyOpen);
  const canRecord = canTransition && internal && row.disposition === "active";
  return {
    caseId: row.id,
    caseVersion: row.version,
    kind: row.kind,
    transaction,
    template,
    recorded: stored.length > 0,
    steps: composed.steps as CasePathStep[],
    current: composed.current,
    next: composed.next,
    completion: completion
      ? {
          completedOn: completion.completedOn,
          registryReference: completion.registryReference,
          ...(internal ? { evidenceVersionId: completion.evidenceVersionId } : {}),
        }
      : null,
    canRecord,
    canComplete: canRecord && readiness.ready,
    completionBlocked: readiness.reason,
    evidenceOptions: canRecord ? await evidenceOptions(db, session, row.id) : [],
  };
}

/** Current document versions on this Case that the reader may open. */
export async function evidenceOptions(db: Executor, session: Session, caseId: string) {
  const candidates = await db
    .select({
      id: documentVersions.id,
      fileName: documentVersions.fileName,
      reference: documents.reference,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
        isNotNull(documentVersions.sealedKey),
      ),
    )
    .orderBy(desc(documentVersions.createdAt))
    .limit(50);
  const out: typeof candidates = [];
  for (const candidate of candidates) {
    try {
      await documentAccess(db, session, candidate.id);
      out.push(candidate);
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
  }
  return out;
}

/** An evidence document must be a current file of this Case that the actor may open. */
export async function caseEvidence(
  db: Executor,
  session: Session,
  caseId: string,
  versionId: string,
) {
  const [file] = await db
    .select({ caseId: documents.caseId, version: documentVersions })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, versionId))
    .for("share");
  if (
    !file ||
    file.caseId !== caseId ||
    !file.version.sealedKey ||
    file.version.supersededByVersionId
  )
    throw new AppError("validation_failed", { fieldErrors: { evidenceVersionId: ["invalid"] } });
  await documentAccess(db, session, versionId);
}

const optionalText = (max: number) => z.string().trim().max(max);
const dateInput = z.union([z.literal(""), z.string().refine(isCalendarDate, "invalid_date")]);
const evidenceInput = z.union([z.literal(""), z.uuid()]);

const stepSchema = z.object({
  ...commandEnvelope,
  stepKey: z.string().regex(stepKeyPattern),
  action: z.enum(pathStepActions),
  date: dateInput,
  clientNote: optionalText(1000),
  internalNote: optionalText(2000),
  reason: optionalText(2000),
  evidenceVersionId: evidenceInput,
  /** Brokerage contract step: signed online or away from the office (yes/no). */
  away: z.enum(["", "yes", "no"]).default(""),
  /** Brokerage contract step: the client asked in writing for an early start (yes/no). */
  earlyStart: z.enum(["", "yes", "no"]).default(""),
});
export type RecordPathStepInput = z.input<typeof stepSchema>;

const result = (row: CaseRow) => ({
  id: row.id,
  reference: row.reference,
  version: row.version + 1,
  recordedAt: new Date().toISOString(),
});

/**
 * Staff record one step: mark it done (date, optional client note, internal note and evidence),
 * mark it not needed with a reason, reopen it with a reason, or set the date it is expected by.
 * The Case version is the concurrency token, as for every other Deal command on the page.
 */
export async function recordPathStep(db: Executor, session: Session, raw: RecordPathStepInput) {
  const input = parseInput(stepSchema, raw);
  const today = calendarDate(new Date(), agencyTimeZone);
  const invalid = (field: string, code: string) =>
    new AppError("validation_failed", { fieldErrors: { [field]: [code] } });
  if ((input.action === "done" || input.action === "expect") && !input.date)
    throw invalid("date", "required");
  if (input.action === "done" && input.date > today) throw invalid("date", "not_future");
  if ((input.action === "skip" || input.action === "reopen") && input.reason.length < 3)
    throw invalid("reason", "required");
  if (input.action !== "done" && input.evidenceVersionId)
    throw invalid("evidenceVersionId", "done_only");
  const { live } = await lifecycleCase(db, session, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.path.step",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await lifecycleCase(ctx.tx, session, input.id, true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      if (!dealTransaction(row.kind)) throw new AppError("not_found");
      const steps = await ensureCasePath(ctx.tx, row.id);
      const step = steps.find((s) => s.stepKey === input.stepKey);
      if (!step) throw new AppError("not_found");
      const to = nextRecordedState(step.state as RecordedStepState, input.action);
      if (!to) throw new AppError("transition_denied");
      const transaction = dealTransaction(row.kind);
      if (!transaction) throw new AppError("not_found");
      const { agreedTerms } = await pathFacts(ctx.tx, row);
      // ADR 0015: the agency's duties are steps that cannot be skipped while in scope, and the
      // steps that move money, a signature or the property wait for the identity checks.
      const blocked = pathDuties(steps, transaction, agreedTerms).block(step, input.action);
      if (blocked) throw new AppError("transition_denied", { fieldErrors: { form: [blocked] } });
      let details: BrokerageDetails | Record<string, never> = {};
      if (
        input.action === "done" &&
        templateStep(step.template, step.stepKey)?.duty === "brokerage_contract"
      ) {
        if (!input.away) throw invalid("away", "required");
        if (input.away === "yes" && !input.earlyStart) throw invalid("earlyStart", "required");
        details = {
          away: input.away === "yes",
          earlyStart: input.away === "yes" ? input.earlyStart === "yes" : null,
        };
      }
      if (input.evidenceVersionId)
        await caseEvidence(ctx.tx, session, row.id, input.evidenceVersionId);
      const now = new Date();
      const patch: Partial<typeof casePathSteps.$inferInsert> =
        input.action === "done"
          ? {
              state: to,
              doneOn: input.date,
              recordedAt: now,
              recordedById: live.account.id,
              clientNote: input.clientNote || null,
              internalNote: input.internalNote || null,
              evidenceVersionId: input.evidenceVersionId || null,
              details,
            }
          : input.action === "skip"
            ? {
                state: to,
                skipReason: input.reason,
                recordedAt: now,
                recordedById: live.account.id,
                clientNote: input.clientNote || null,
              }
            : input.action === "reopen"
              ? {
                  state: to,
                  doneOn: null,
                  skipReason: null,
                  evidenceVersionId: null,
                  clientNote: null,
                  details: {},
                  recordedAt: now,
                  recordedById: live.account.id,
                }
              : { expectedOn: input.date };
      await ctx.tx
        .update(casePathSteps)
        .set({ ...patch, version: sql`${casePathSteps.version} + 1`, updatedAt: now })
        .where(and(eq(casePathSteps.id, step.id), eq(casePathSteps.version, step.version)));
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        `case.path.${input.action}`,
        "case.transition",
        {
          stepKey: step.stepKey,
          template: step.template,
          from: step.state,
          to,
          ...(input.date ? { date: input.date } : {}),
          ...(input.action === "reopen" ? { reason: input.reason } : {}),
          ...(input.evidenceVersionId ? { evidenceVersionId: input.evidenceVersionId } : {}),
          ...("away" in details ? { details } : {}),
        },
        step.clientVisible && input.action !== "expect" ? "participants" : "internal",
      );
      return { ...result(row), stepKey: step.stepKey, state: to };
    },
  );
}

const completeSchema = z.object({
  ...commandEnvelope,
  completedOn: z.string().refine(isCalendarDate, "invalid_date"),
  registryReference: optionalText(200),
  evidenceVersionId: evidenceInput,
  reviewed: z.boolean().refine((value) => value, "review_required"),
});
export type CompleteDealInput = z.input<typeof completeSchema>;

/**
 * The broker confirms a Deal whose path is complete: terms agreed, every recorded step done or
 * not needed, the final step done. One operation records the completion, moves the Case to its
 * pipeline's terminal stage and closes it with the structured `deal_completed` outcome, after
 * the same open-work check and step-up as the existing close flow. The path's recorded steps are
 * the completion evidence, so this route does not need the separate `case_completion` document
 * the stage form asks for. A buyer's or tenant's completion also marks the agreed listing sold or
 * let (ADR 0015), and an in-scope duty step must be done, never merely not needed.
 */
export async function completeDealFromPath(db: Executor, session: Session, raw: CompleteDealInput) {
  const input = parseInput(completeSchema, raw);
  if (input.completedOn > calendarDate(new Date(), agencyTimeZone))
    throw new AppError("validation_failed", { fieldErrors: { completedOn: ["not_future"] } });
  const { live } = await lifecycleCase(db, session, input.id);
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.path.complete",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await lifecycleCase(ctx.tx, session, input.id, true);
      requireFreshAuth(await liveStaff(ctx.tx, session));
      version(row, input.expectedVersion);
      const stage = terminalStage(row.kind);
      if (row.disposition !== "active" || row.pendingOwnerId || !stage || !row.ownerId)
        throw new AppError("transition_denied");
      const steps = await storedSteps(ctx.tx, row.id, true);
      const { facts, agreedTerms, agreedListingId } = await pathFacts(ctx.tx, row);
      const transaction = dealTransaction(row.kind);
      if (!transaction) throw new AppError("transition_denied");
      // A sale never completes with its identity checks or brokerage contract open (ADR 0015).
      const readiness = completionReadiness(
        facts,
        steps.map(stepInput),
        pathDuties(steps, transaction, agreedTerms).dutyOpen,
      );
      if (!readiness.ready)
        throw new AppError("transition_denied", {
          fieldErrors: { form: [readiness.reason ?? "steps_open"] },
        });
      if (input.evidenceVersionId)
        await caseEvidence(ctx.tx, session, row.id, input.evidenceVersionId);
      const resolved = await assertResolved(ctx.tx, row.id);
      const commitmentDispositions = Object.fromEntries(
        resolved.map((t) => [
          t.id,
          `${t.state}: ${t.outcome ?? t.reason ?? "Recorded terminal state"}`,
        ]),
      );
      const template = steps[0]?.template ?? "";
      const [completion] = await ctx.tx
        .insert(caseCompletions)
        .values({
          caseId: row.id,
          template,
          completedOn: input.completedOn,
          registryReference: input.registryReference || null,
          evidenceVersionId: input.evidenceVersionId || null,
          recordedById: live.account.id,
          operationId: ctx.operationId,
        })
        .returning({ id: caseCompletions.id });
      if (!completion) throw new Error("Deal completion insert failed");
      const reason = "Deal path completed";
      // The stage guard's completion evidence is the recorded completion itself.
      if (row.stage !== stage)
        allow(
          caseStageTransitions(row.kind).guard(
            row.stage as CaseStage,
            stage,
            {
              responsibleBrokerId: row.ownerId,
              completionEvidenceIds: [completion.id],
              remainingObligations: [],
              reason,
            },
            live.actor,
          ),
        );
      allow(
        dispositionTransitions.guard(
          row.disposition,
          "closed",
          {
            reason,
            outcome: dealCompletedOutcome,
            openCommitmentIds: [],
            commitmentDispositions,
          },
          live.actor,
        ),
      );
      await bumpCase(ctx.tx, row.id, row.version, {
        stage,
        disposition: "closed",
        dispositionReason: reason,
        closureOutcome: dealCompletedOutcome,
        commitmentDispositions,
      });
      await ctx.tx.insert(caseStageHistory).values({
        caseId: row.id,
        fromStage: row.stage,
        toStage: stage,
        reason,
        // `toDisposition` starts the retention clock exactly as the existing close flow does.
        evidence: {
          kind: "deal_path_completed",
          fromDisposition: row.disposition,
          toDisposition: "closed",
          outcome: dealCompletedOutcome,
          completionId: completion.id,
          template,
          completedOn: input.completedOn,
          steps: steps.map((s) => ({ key: s.stepKey, state: s.state, version: s.version })),
          commitments: resolved,
          remainingObligations: [],
        },
        actorKind: ctx.actor.kind,
        actorId: ctx.actor.id,
        operationId: ctx.operationId,
      });
      // The agreed home is sold or let: it stops being offered as available. Only a buyer's or
      // tenant's Deal holds the agreed proposal; the listing entry names no party.
      const outcome = row.kind === "buyer" ? "sold" : row.kind === "tenant" ? "let" : null;
      const listing =
        outcome && agreedListingId
          ? await recordListingOutcome(ctx.tx, live.actor, {
              listingId: agreedListingId,
              outcome,
              reason: "Deal completed",
              evidenceIds: [completion.id],
              operationId: ctx.operationId,
            })
          : null;
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.deal_completed",
        "case.transition",
        {
          completionId: completion.id,
          completedOn: input.completedOn,
          template,
          ...(listing
            ? { listingOutcome: listing.status, listingReference: listing.reference }
            : {}),
        },
        "participants",
      );
      return {
        ...result(row),
        completionId: completion.id,
        listingOutcome: listing?.status ?? null,
      };
    },
  );
}
