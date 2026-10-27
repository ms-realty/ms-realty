// O26/AT45/AT56: a server-only revision fence, never a disclosure inventory.
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import {
  privacyProcessingRestrictions,
  privacyPropagationEvents,
  privacySafetyDecisions,
} from "@/db/schema";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

/**
 * The three sources are append-only. Their canonical metadata/decision commitment binds
 * every supported revision without selecting review, effect or propagation evidence JSON.
 * Callers must authorize any returned request binding before exposing even a summary.
 */
export async function privacySafetyRevision(
  db: Executor,
  partyIds: string[],
  lock = false,
  maxRows = 1000,
) {
  const sources = [...new Set(partyIds)].sort();
  if (!sources.length) throw new AppError("validation_failed");
  const decisionQuery = db
    .select({
      sequence: privacySafetyDecisions.sequence,
      id: privacySafetyDecisions.id,
      operationId: privacySafetyDecisions.operationId,
      partyId: privacySafetyDecisions.partyId,
      requestId: privacySafetyDecisions.requestId,
      requestHash: privacySafetyDecisions.requestHash,
      previousDigest: privacySafetyDecisions.previousDigest,
      digest: privacySafetyDecisions.digest,
      recordedAt: privacySafetyDecisions.recordedAt,
    })
    .from(privacySafetyDecisions)
    .where(inArray(privacySafetyDecisions.partyId, sources))
    .orderBy(asc(privacySafetyDecisions.sequence))
    .limit(maxRows + 1);
  const decisions = await (lock ? decisionQuery.for("share") : decisionQuery);
  const restrictionQuery = db
    .select({
      partyId: privacyProcessingRestrictions.partyId,
      purpose: privacyProcessingRestrictions.purpose,
      decisionSequence: privacyProcessingRestrictions.decisionSequence,
      createdAt: privacyProcessingRestrictions.createdAt,
    })
    .from(privacyProcessingRestrictions)
    .where(inArray(privacyProcessingRestrictions.partyId, sources))
    .orderBy(asc(privacyProcessingRestrictions.partyId), asc(privacyProcessingRestrictions.purpose))
    .limit(maxRows + 1);
  const restrictions = await (lock ? restrictionQuery.for("share") : restrictionQuery);
  const propagationQuery = db
    .select({
      id: privacyPropagationEvents.id,
      decisionSequence: privacyPropagationEvents.decisionSequence,
      boundary: privacyPropagationEvents.boundary,
      state: privacyPropagationEvents.state,
      createdAt: privacyPropagationEvents.createdAt,
    })
    .from(privacyPropagationEvents)
    .innerJoin(
      privacySafetyDecisions,
      eq(privacySafetyDecisions.sequence, privacyPropagationEvents.decisionSequence),
    )
    .where(inArray(privacySafetyDecisions.partyId, sources))
    .orderBy(asc(privacyPropagationEvents.id))
    .limit(maxRows + 1);
  const propagation = await (lock ? propagationQuery.for("share") : propagationQuery);
  if ([decisions, restrictions, propagation].some((rows) => rows.length > maxRows))
    throw new AppError("validation_failed");
  return {
    fingerprint: keyedHash(
      getEnv().authSecret,
      `privacy-safety-revision:v1:${hashRequest(
        JSON.parse(JSON.stringify({ sources, decisions, restrictions, propagation })),
      )}`,
    ),
    clientAccessRestricted: restrictions.some((row) => row.purpose === "client_access"),
    requestBindings: decisions.flatMap((row) =>
      row.requestId ? [{ id: row.requestId, partyId: row.partyId }] : [],
    ),
  };
}
