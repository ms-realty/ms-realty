import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { approvals, externalActions, grants, principals, staffMemberships } from "@/db/schema";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { liveStaff, parseInput } from "../work/shared";
import { type AlertRule, validateAlertRule } from "./rule";
import {
  alertSubjectType,
  alertTemplateCopy,
  alertTemplateVersion,
  maxDigestItems,
} from "./template";

// Stable subject identity for this one fixed service rule, not a reusable general policy engine.
export const alertRuleId = "3638696e-2d95-4fd0-91ef-16424415363f";
export const alertRuleSubject = "search_alert_rule";
const resource = { type: alertRuleSubject, id: alertRuleId, audience: "internal" as const };
export function alertRuleSnapshot(input: AlertRule) {
  const rule = validateAlertRule(input);
  return {
    version: 1,
    ...rule,
    purpose: "search_alerts",
    channel: "email",
    template: alertTemplateCopy,
    fields: [
      "approved listing title",
      "listing reference",
      "current canonical listing URL",
      "needs-confirmation notice",
      "private preferences URL",
    ],
    format: "plaintext; strip line and bidi controls from title; no HTML or tracking",
    schedule:
      "at most once per subscriber-local calendar day or Monday-starting calendar week; daily default; no fixed delivery hour",
    maxItems: maxDigestItems,
    safeguards:
      "exact current verified purpose consent and human rule approval; current publication and criteria; revision dedupe; pause/edit/withdraw fence; unknown delivery never replayed",
  };
}
export const alertRuleHash = (rule: AlertRule) => hashRequest(alertRuleSnapshot(rule));
async function ruleDecisions(db: Executor, lock = false) {
  const query = db
    .select()
    .from(approvals)
    .where(and(eq(approvals.subjectType, alertRuleSubject), eq(approvals.subjectId, alertRuleId)))
    .orderBy(desc(approvals.createdAt), desc(approvals.id));
  return lock ? query.for("share") : query;
}
async function lockDecider(db: Executor, id: string) {
  await db.select({ id: principals.id }).from(principals).where(eq(principals.id, id)).for("share");
  await db
    .select({ id: staffMemberships.id })
    .from(staffMemberships)
    .where(eq(staffMemberships.principalId, id))
    .for("share");
  await db
    .select({ id: grants.id })
    .from(grants)
    .where(eq(grants.principalId, id))
    .orderBy(grants.id)
    .for("share");
}
/** Locks protect disable/grant revocation through the bounded provider handoff transaction. */
export async function approvedAlertRule(
  db: Executor,
  rule: AlertRule,
  options: { lock?: boolean; now?: Date; approvalId?: string } = {},
) {
  const now = options.now ?? new Date();
  const [decision] = await ruleDecisions(db, options.lock);
  const hash = alertRuleHash(rule);
  if (
    decision?.kind !== "message_send" ||
    decision.subjectVersion !== 1 ||
    decision.subjectHash !== hash ||
    decision.state !== "approved" ||
    decision.invalidatedAt ||
    !decision.expiresAt ||
    decision.expiresAt <= now ||
    !decision.decidedAt ||
    decision.decidedAt > now ||
    decision.decidedByKind !== "staff" ||
    !z.uuid().safeParse(decision.decidedById).success ||
    decision.decidedWithCapability !== "message.send_external" ||
    (options.approvalId && options.approvalId !== decision.id)
  )
    return null;
  const scope = z
    .object({
      purpose: z.literal("search_alerts"),
      channel: z.literal("email"),
      templateVersion: z.literal(alertTemplateVersion),
    })
    .strict()
    .safeParse(decision.scope);
  const evidence = z.object({ rule: z.unknown() }).strict().safeParse(decision.evidence);
  if (
    !scope.success ||
    !evidence.success ||
    !evidence.data.rule ||
    hashRequest(evidence.data.rule) !== hash
  )
    return null;
  const id = decision.decidedById as string;
  if (options.lock) await lockDecider(db, id);
  for (const capability of ["settings.manage", "message.send_external"] as const) {
    if (!(await can(db, { kind: "staff", id }, capability, resource, now))) return null;
  }
  return { id: decision.id, hash, expiresAt: decision.expiresAt };
}
async function operator(db: Executor, session: Session, fresh = false) {
  const live = await liveStaff(db, session);
  if (fresh) requireFreshAuth(live);
  await assertCan(db, live.actor, "settings.manage", resource);
  await assertCan(db, live.actor, "message.send_external", resource);
  return live;
}
export async function readAlertRule(db: Executor, session: Session, rule: AlertRule) {
  await operator(db, session);
  const [latest] = await ruleDecisions(db);
  return {
    snapshot: alertRuleSnapshot(rule),
    hash: alertRuleHash(rule),
    approval: await approvedAlertRule(db, rule),
    latest: latest
      ? {
          id: latest.id,
          version: latest.version,
          state: latest.state,
          decidedAt: latest.decidedAt,
          expiresAt: latest.expiresAt,
        }
      : null,
  };
}
const decisionInput = z
  .object({
    operationId: z.string().min(16).max(200),
    decision: z.enum(["approve", "disable"]),
    expectedRuleHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedDecisionId: z.uuid().nullable(),
    expectedDecisionVersion: z.number().int().nonnegative(),
    reviewed: z.literal(true),
    note: z.string().trim().min(3).max(1000),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export async function decideAlertRule(
  db: Executor,
  session: Session,
  rule: AlertRule,
  input: unknown,
) {
  const value = parseInput(decisionInput, input);
  const live = await operator(db, session, true);
  if (value.expectedRuleHash !== alertRuleHash(rule)) throw new AppError("approval_stale");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "subscriptions.rule.decide",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      const current = await operator(tx, session, true);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${alertRuleSubject}, 0))`);
      const [latest] = await ruleDecisions(tx);
      if (
        (latest?.id ?? null) !== value.expectedDecisionId ||
        (latest?.version ?? 0) !== value.expectedDecisionVersion
      )
        throw new AppError("version_conflict");
      const now = new Date();
      const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
      if (value.decision === "approve" && (!expiresAt || expiresAt <= now))
        throw new AppError("validation_failed");
      await tx
        .update(approvals)
        .set({
          state: "invalidated",
          invalidatedAt: now,
          invalidationReason:
            value.decision === "disable"
              ? "Human disabled search-alert rule"
              : "Human replaced search-alert rule approval",
          version: sql`${approvals.version} + 1`,
        })
        .where(
          and(
            eq(approvals.subjectType, alertRuleSubject),
            eq(approvals.subjectId, alertRuleId),
            eq(approvals.state, "approved"),
          ),
        );
      let approvalId: string | null = null;
      if (value.decision === "approve") {
        const [decision] = await tx
          .insert(approvals)
          .values({
            kind: "message_send",
            state: "approved",
            subjectType: alertRuleSubject,
            subjectId: alertRuleId,
            subjectVersion: 1,
            subjectHash: value.expectedRuleHash,
            scope: {
              purpose: "search_alerts",
              channel: "email",
              templateVersion: alertTemplateVersion,
            },
            evidence: { rule: alertRuleSnapshot(rule) },
            requestedByKind: "staff",
            requestedById: current.actor.id,
            decidedByKind: "staff",
            decidedById: current.actor.id,
            decidedWithCapability: "message.send_external",
            decidedAt: now,
            decisionNote: value.note,
            expiresAt,
          })
          .returning({ id: approvals.id });
        approvalId = decision?.id ?? null;
      }
      // Every previous queued digest references a prior approval, including after reapproval.
      await tx
        .update(externalActions)
        .set({
          state: "cancelled",
          lastErrorCode: "alert_rule_changed",
          version: sql`${externalActions.version} + 1`,
        })
        .where(
          and(
            eq(externalActions.subjectType, alertSubjectType),
            eq(externalActions.state, "queued"),
          ),
        );
      await recordAudit(tx, {
        actor: current.actor,
        action: `subscriptions.rule.${value.decision}`,
        recordType: alertRuleSubject,
        recordId: alertRuleId,
        operationId,
        capability: "message.send_external",
        payload: { ruleHash: value.expectedRuleHash, approvalId },
      });
      return {
        approvalId,
        decision: value.decision,
        ruleHash: value.expectedRuleHash,
        recordedAt: now.toISOString(),
      };
    },
  );
}
