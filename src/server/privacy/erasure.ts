// O26 / AT45: explicit human command, source-bound optional-copy disposition and typed outcomes.
import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  operations,
  privacyPropagationEvents,
  privacyRequests,
  privacySafetyDecisions,
} from "@/db/schema";
import { readOperatingPolicySnapshot } from "@/domain/operating-policy";
import {
  type ErasureInventory,
  type ErasureSourceDecision,
  erasureCategories,
  erasureDecision,
  optionalProcessingPurposes,
  type PrivacySafetyEffect,
} from "@/domain/privacy-erasure";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { parseInput } from "../work/shared";
import { privacyOperator } from "./access";
import {
  collectErasureInventory,
  erasureRequest,
  erasureSourcePreviews,
  lockErasureSources,
} from "./erasure-inventory";
import { privacyOwners } from "./requests";
import {
  appendPrivacySafetyDecision,
  applyPrivacySafetyEffect,
  recordPrivacyPropagation,
} from "./safety-ledger";

const envelope = {
  operationId: z.uuid(),
  requestId: z.uuid(),
  expectedVersion: z.number().int().positive(),
};
const applySchema = z
  .object({
    ...envelope,
    inventoryDigest: z.string().regex(/^[a-f0-9]{64}$/),
    purposes: z.array(z.enum(optionalProcessingPurposes)).min(1).max(2),
    decisions: z.array(erasureDecision).length(erasureCategories.length),
    confirmed: z.literal(true),
  })
  .strict();
export type ApplyPrivacyErasure = z.input<typeof applySchema>;

async function authorizeEffect(db: Executor, session: Session, requestId: string) {
  const live = await privacyOperator(db, session, requestId);
  // Account-wide credential revocation is an access-administration decision. A
  // record-scoped privacy grant alone cannot silently acquire this capability.
  await assertCan(db, live.actor, "access.grant");
  return live;
}

function validateDecisions(inventory: ErasureInventory, decisions: ErasureSourceDecision[]) {
  if (new Set(decisions.map((row) => row.category)).size !== erasureCategories.length)
    throw new AppError("validation_failed");
  const policy = readOperatingPolicySnapshot(inventory.policy);
  for (const decision of decisions) {
    const sources = inventory.sources.filter((row) => row.category === decision.category);
    if (
      hashRequest([...decision.sourceKeys].sort()) !==
      hashRequest(sources.map((row) => row.key).sort())
    )
      throw new AppError("version_conflict");
    if (decision.category === "optional_processing") {
      if (
        decision.disposition !== "restrict_processing" ||
        decision.classification !== "optional_only"
      )
        throw new AppError("validation_failed");
    } else if (decision.category === "client_access") {
      if (
        decision.disposition !== "revoke_client_access" ||
        decision.classification !== "account_credentials"
      )
        throw new AppError("validation_failed");
    } else if (decision.disposition === "erase_optional_copy") {
      // A reviewed reference is context, not a typed legal-retention classifier.
      // This separate per-category/source human disposition is necessary, and it
      // still cannot override any server hold, business dependency or unknown policy.
      if (
        !policy?.document.retentionReference ||
        decision.classification !== "optional_only" ||
        inventory.retentionHold ||
        inventory.businessDependencies ||
        sources.some((row) => !row.eligible)
      )
        throw new AppError("transition_denied");
      if (
        !policy.document.contactPurposes.savedSearch ||
        !policy.document.contactPurposes.marketing
      )
        throw new AppError("transition_denied");
    } else if (!["retain_restricted", "hold_unknown"].includes(decision.disposition)) {
      throw new AppError("validation_failed");
    } else if (decision.disposition === "hold_unknown" && decision.classification !== "unknown") {
      throw new AppError("validation_failed");
    }
  }
}

export async function readPrivacyErasureWorkbench(
  db: Executor,
  session: Session,
  requestId: string,
) {
  return db.transaction(async (tx) => {
    // A GET can show current held work; it never applies a restriction.
    const { request } = await erasureRequest(tx, session, z.uuid().parse(requestId));
    const inventory = await collectErasureInventory(tx, session, request.id);
    const decisions = await tx
      .select()
      .from(privacySafetyDecisions)
      .where(eq(privacySafetyDecisions.requestId, request.id))
      .orderBy(desc(privacySafetyDecisions.sequence));
    const events = decisions.length
      ? await tx
          .select()
          .from(privacyPropagationEvents)
          .where(
            sql`${privacyPropagationEvents.decisionSequence} in (${sql.join(
              decisions.map((row) => sql`${row.sequence}`),
              sql`,`,
            )})`,
          )
          .orderBy(asc(privacyPropagationEvents.createdAt))
      : [];
    return {
      request,
      inventory,
      inventoryDigest: hashRequest(inventory),
      sourcePreviews: await erasureSourcePreviews(tx, inventory),
      decisions: decisions.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        digest: row.digest,
        recordedAt: row.recordedAt,
        review: row.review,
      })),
      events,
      fulfilment: decisions.length ? ("partial" as const) : ("not_applied" as const),
      independentArchive: "unverified" as const,
    };
  });
}

export async function applyPrivacyErasure(db: Executor, session: Session, input: unknown) {
  const value = parseInput(applySchema, input);
  await authorizeEffect(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.erasure.apply",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      await lockErasureSources(tx);
      const live = await authorizeEffect(tx, session, value.requestId);
      const { request } = await erasureRequest(tx, session, value.requestId, value.expectedVersion);
      if (
        !["in_progress", "on_legal_hold"].includes(request.state) ||
        !request.verifiedAt ||
        !request.responsibleId ||
        !(await privacyOwners(tx)).some((row) => row.id === request.responsibleId)
      )
        throw new AppError("transition_denied");
      const inventory = await collectErasureInventory(tx, session, request.id);
      if (hashRequest(inventory) !== value.inventoryDigest) throw new AppError("version_conflict");
      if (new Set(value.purposes).size !== value.purposes.length)
        throw new AppError("validation_failed");
      validateDecisions(inventory, value.decisions);
      const erase = (category: ErasureSourceDecision["category"]) =>
        value.decisions.find((row) => row.category === category)?.disposition ===
        "erase_optional_copy";
      const ids = (category: ErasureSourceDecision["category"]) =>
        inventory.sources
          .filter((row) => row.category === category)
          .map((row) => row.key.split(":")[1] as string);
      const effect: PrivacySafetyEffect = {
        kind: "privacy_restriction_v1",
        partyId: inventory.partyId,
        requestId: request.id,
        purposes: value.purposes,
        clientIds: ids("client_access"),
        erasePreferences: erase("contact_preferences"),
        eraseAliases: erase("matching_aliases"),
        contactIds: erase("optional_contacts") ? ids("optional_contacts") : [],
        clientProfileIds: erase("client_profile_copies")
          ? inventory.sources
              .filter(
                (row) =>
                  row.category === "client_profile_copies" && row.key.startsWith("principal:"),
              )
              .map((row) => row.key.split(":")[1] as string)
          : [],
        personalSavedIds: erase("client_profile_copies")
          ? inventory.sources
              .filter((row) => row.key.startsWith("saved:"))
              .map((row) => row.key.split(":")[1] as string)
          : [],
        savedTransferIds: erase("client_profile_copies")
          ? inventory.sources
              .filter((row) => row.key.startsWith("transfer:"))
              .map((row) => row.key.split(":")[1] as string)
          : [],
        searchSubscriptionIds:
          erase("optional_search_criteria") && value.purposes.includes("search_alerts")
            ? ids("optional_search_criteria")
            : [],
        inventoryDigest: value.inventoryDigest,
      };
      const entry = await appendPrivacySafetyDecision(tx, {
        operationId,
        partyId: inventory.partyId,
        requestId: request.id,
        requestHash: hashRequest(value),
        review: {
          kind: "privacy_erasure_review_v1",
          inventory,
          decisions: value.decisions,
          reviewedById: live.account.id,
          policyClassification: "per_source_human_disposition",
        },
        effect,
      });
      const result = await applyPrivacySafetyEffect(tx, effect, entry.sequence, live.actor);
      await recordPrivacyPropagation(tx, entry.sequence, "application", "applied", result);
      await recordPrivacyPropagation(tx, entry.sequence, "business_and_history", "held", {
        reason: inventory.retentionHold
          ? "retention_obligation"
          : "legal_joint_and_immutable_history_require_separate_disposition",
      });
      await recordPrivacyPropagation(tx, entry.sequence, "private_files", "unsupported", {
        reason: "storage_has_no_delete_or_retained_recovery_point_proof",
        physicalDeletion: false,
      });
      await recordPrivacyPropagation(tx, entry.sequence, "provider_data", "unsupported", {
        reason: "existing_provider_adapter_supports_sending_only",
        providerDeletion: false,
      });
      await recordPrivacyPropagation(tx, entry.sequence, "independent_archive", "held", {
        reason: "independent_archive_and_current_watermark_unverified",
      });
      await tx
        .update(privacyRequests)
        .set({
          version: request.version + 1,
          updatedAt: new Date(),
          // Optional processing stops even while retained evidence remains held.
          scope: {
            ...(request.scope as object),
            erasureDecisionSequence: entry.sequence,
            dueCondition: "erasure_propagation_partial",
          },
        })
        .where(
          and(eq(privacyRequests.id, request.id), eq(privacyRequests.version, request.version)),
        );
      await recordAudit(tx, {
        actor: live.actor,
        action: "privacy.erasure.applied",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          sequence: entry.sequence,
          digest: entry.digest,
          fulfilment: "partial",
          ...result,
        },
      });
      return {
        id: request.id,
        decisionId: entry.id,
        sequence: entry.sequence,
        digest: entry.digest,
        requestVersion: request.version + 1,
        fulfilment: "partial" as const,
        localEffect: "applied" as const,
        independentArchive: "unverified" as const,
      };
    },
  );
}

/** A dedicated typed completion check. In this slice actual file/provider/archive boundaries
 * have no supported proof adapter, so they cannot be changed to complete by a checkbox. */
export async function completePrivacyErasure(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z
      .object({
        ...envelope,
        sequence: z.number().int().positive(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
      })
      .strict(),
    input,
  );
  await authorizeEffect(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.erasure.complete",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx }) => {
      await authorizeEffect(tx, session, value.requestId);
      const { request } = await erasureRequest(tx, session, value.requestId, value.expectedVersion);
      const [entry] = await tx
        .select()
        .from(privacySafetyDecisions)
        .where(
          and(
            eq(privacySafetyDecisions.sequence, value.sequence),
            eq(privacySafetyDecisions.requestId, request.id),
          ),
        );
      if (!entry || entry.digest !== value.digest || entry.partyId !== request.partyId)
        throw new AppError("not_found");
      const [latest] = await tx
        .select({ sequence: privacySafetyDecisions.sequence })
        .from(privacySafetyDecisions)
        .where(eq(privacySafetyDecisions.requestId, request.id))
        .orderBy(desc(privacySafetyDecisions.sequence))
        .limit(1);
      if (latest?.sequence !== entry.sequence) throw new AppError("version_conflict");
      const events = await tx
        .select()
        .from(privacyPropagationEvents)
        .where(eq(privacyPropagationEvents.decisionSequence, entry.sequence));
      const unresolved = events
        .filter((event) => event.state !== "applied")
        .map((event) => event.boundary);
      // Current supported adapters deliberately cannot establish all the required boundaries.
      // No successful request-state transition is available through free text or status edits.
      return {
        id: request.id,
        sequence: entry.sequence,
        fulfilment: "partial" as const,
        completed: false as const,
        unresolved,
        reason: "actual_boundary_evidence_required" as const,
      };
    },
  );
}

/** Own exact-key reconciliation under the same fence as runOperation; no payload disclosure. */
export async function privacyErasureOperationStatus(
  db: Executor,
  session: Session,
  input: {
    requestId: string;
    operationId: string;
    type: "apply" | "complete";
    expectedVersion: number;
  },
) {
  const value = z
    .object({
      requestId: z.uuid(),
      operationId: z.uuid(),
      type: z.enum(["apply", "complete"]),
      expectedVersion: z.number().int().positive(),
    })
    .parse(input);
  return db.transaction(async (tx) => {
    const live = await authorizeEffect(tx, session, value.requestId);
    await erasureRequest(tx, session, value.requestId);
    const operationType = `privacy.erasure.${value.type}`;
    const key = JSON.stringify([live.actor.kind, live.actor.id, operationType, value.operationId]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${key},0)) as locked`,
    );
    if (!lock?.locked) return "pending" as const;
    const [receipt] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, live.actor.kind),
          eq(operations.actorId, live.actor.id),
          eq(operations.operationType, operationType),
          eq(operations.idempotencyKey, value.operationId),
        ),
      );
    if (!receipt) return "absent" as const;
    if (
      receipt.resultType !== "privacy_request" ||
      receipt.resultId !== value.requestId ||
      receipt.expectedRevision !== value.expectedVersion
    )
      return "unknown" as const;
    if (receipt.status === "succeeded" || receipt.status === "failed") return receipt.status;
    return receipt.status === "outcome_unknown" ? ("unknown" as const) : ("pending" as const);
  });
}
