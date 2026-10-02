import "server-only";
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { externalActions, subscriptions } from "@/db/schema";
import type { ExternalActionState } from "@/domain/external-action";
import { maxDeliveryAttempts } from "@/domain/message";
import { hashRequest } from "../crypto";
import type { Database, Executor } from "../db";
import { AppError } from "../errors";
import type { MessageProvider, ProviderResult } from "../jobs/provider";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { approvedAlertRule } from "./approval";
import { type AlertRule, configuredAlertRule, validateAlertRule } from "./rule";
import { alertPeriod } from "./schedule";
import { criteriaHash, lockedRecipient, lockPublicationSources, matchingItems } from "./sources";
import {
  type AlertPayload,
  alertPayload,
  alertPreferencesUrl,
  alertSubjectType,
  alertTemplate,
  renderSearchAlert,
} from "./template";

export interface AlertOptions {
  readonly now?: Date;
  readonly rule?: AlertRule | null;
}
export type PlanResult =
  | {
      readonly state:
        | "disabled"
        | "ineligible"
        | "rule_unapproved"
        | "no_matches"
        | "period_complete";
      readonly scanIncomplete?: boolean;
    }
  | {
      readonly state: "queued" | "existing";
      readonly actionId: string;
      readonly scanIncomplete: boolean;
    };
const resolveRule = (options: AlertOptions) =>
  options.rule === undefined
    ? configuredAlertRule()
    : options.rule
      ? validateAlertRule(options.rule)
      : null;
const subject = (id: string) =>
  and(eq(externalActions.subjectType, alertSubjectType), eq(externalActions.subjectId, id));
async function cancel(db: Executor, actionId: string, code: string) {
  await db
    .update(externalActions)
    .set({
      state: "cancelled",
      lastErrorCode: code,
      updatedAt: new Date(),
      version: sql`${externalActions.version} + 1`,
    })
    .where(
      and(
        eq(externalActions.id, actionId),
        sql`${externalActions.state} in ('queued','attempting')`,
      ),
    );
  return "cancelled" as const;
}

/** One immutable logical digest. Empty periods never create an email effect. */
export async function planSearchAlerts(
  db: Database,
  subscriptionId: string,
  options: AlertOptions = {},
): Promise<PlanResult> {
  const rule = resolveRule(options);
  if (!rule) return { state: "disabled" };
  const now = options.now ?? new Date();
  return db.transaction(async (tx): Promise<PlanResult> => {
    const eligible = await lockedRecipient(tx, subscriptionId);
    if (!eligible) return { state: "ineligible" };
    const approval = await approvedAlertRule(tx, rule, { now, lock: true });
    if (!approval) return { state: "rule_unapproved" };
    const { subscription, contact, search, recipient } = eligible;
    const frequency = subscription.frequency ?? "daily";
    const period = alertPeriod(now, subscription.timezone, frequency);
    const queued = await tx
      .select()
      .from(externalActions)
      .where(and(subject(subscriptionId), eq(externalActions.state, "queued")))
      .orderBy(externalActions.id)
      .for("update");
    for (const row of queued) {
      const parsed = alertPayload.safeParse(row.payload);
      const digest = parsed.success ? parsed.data.params.digest : null;
      if (
        !digest ||
        row.payloadDigest !== hashRequest(row.payload) ||
        row.sourceGeneration !== subscription.version ||
        digest.period !== period ||
        digest.ruleApprovalId !== approval.id ||
        digest.ruleHash !== approval.hash ||
        digest.criteriaHash !== criteriaHash(subscription.criteria) ||
        digest.contactVersion !== contact.version ||
        parsed.data?.recipient !== recipient
      ) {
        await cancel(tx, row.id, "alert_snapshot_changed");
      } else return { state: "existing", actionId: row.id, scanIncomplete: digest.scanIncomplete };
    }
    const [alreadyAttempted] = await tx
      .select({ id: externalActions.id })
      .from(externalActions)
      .where(
        and(
          subject(subscriptionId),
          ne(externalActions.state, "cancelled"),
          sql`${externalActions.payload} #>> '{params,digest,period}' = ${period}`,
        ),
      )
      .limit(1);
    if (
      alreadyAttempted ||
      (subscription.lastSentAt &&
        alertPeriod(subscription.lastSentAt, subscription.timezone, frequency) === period)
    )
      return { state: "period_complete" };
    const matches = await matchingItems(tx, search, rule, now, { subscriptionId });
    if (!matches.items.length) return { state: "no_matches", scanIncomplete: matches.incomplete };
    const payload: AlertPayload = {
      channel: "email",
      recipient,
      template: alertTemplate,
      params: {
        digest: {
          schemaVersion: 1,
          subscriptionVersion: subscription.version,
          ruleApprovalId: approval.id,
          ruleHash: approval.hash,
          contactMethodId: contact.id,
          contactVersion: contact.version,
          policyVersion: subscription.policyVersion,
          templateVersion: rule.templateVersion,
          criteriaSnapshot: subscription.criteria as Record<string, unknown>,
          criteriaHash: criteriaHash(subscription.criteria),
          locale: search.locale,
          timezone: subscription.timezone,
          frequency,
          period,
          plannedAt: now.toISOString(),
          preferencesUrl: alertPreferencesUrl(rule.clientOrigin, search.locale),
          scanIncomplete: matches.incomplete,
          items: matches.items,
        },
      },
    };
    const validated = alertPayload.safeParse(payload);
    if (!validated.success) return { state: "ineligible" };
    const digest = hashRequest(payload);
    // The content hash permits a new plan after a pre-send cancellation without mutating an
    // old payload. The subscription lock and period check prevent two live effects per bucket.
    const effectKey = `search-alert:${subscriptionId}:${period}:v${subscription.version}:${hashRequest({ approvalId: approval.id, items: matches.items, criteria: subscription.criteria }).slice(0, 24)}`;
    const [created] = await tx
      .insert(externalActions)
      .values({
        kind: "email_send",
        subjectType: alertSubjectType,
        subjectId: subscriptionId,
        sourceGeneration: subscription.version,
        effectKey,
        payload,
        payloadDigest: digest,
      })
      .onConflictDoNothing({ target: externalActions.effectKey })
      .returning({ id: externalActions.id });
    if (!created) return { state: "period_complete" };
    return { state: "queued", actionId: created.id, scanIncomplete: matches.incomplete };
  });
}

type ActionRow = typeof externalActions.$inferSelect;
async function currentPayload(db: Executor, row: ActionRow, rule: AlertRule, now: Date) {
  const parsed = alertPayload.safeParse(row.payload);
  if (
    row.kind !== "email_send" ||
    row.subjectType !== alertSubjectType ||
    !row.subjectId ||
    !parsed.success ||
    row.payloadDigest !== hashRequest(row.payload)
  )
    return null;
  const payload = parsed.data,
    digest = payload.params.digest;
  const eligible = await lockedRecipient(db, row.subjectId);
  if (!eligible) return null;
  const { subscription, contact, search, recipient } = eligible;
  if (
    row.sourceGeneration !== subscription.version ||
    digest.subscriptionVersion !== subscription.version ||
    digest.contactMethodId !== contact.id ||
    digest.contactVersion !== contact.version ||
    payload.recipient !== recipient ||
    digest.policyVersion !== subscription.policyVersion ||
    digest.criteriaHash !== criteriaHash(subscription.criteria) ||
    hashRequest(digest.criteriaSnapshot) !== digest.criteriaHash ||
    digest.locale !== search.locale ||
    digest.timezone !== subscription.timezone ||
    digest.frequency !== subscription.frequency ||
    digest.period !== alertPeriod(now, subscription.timezone, digest.frequency)
  )
    return null;
  const approval = await approvedAlertRule(db, rule, {
    now,
    lock: true,
    approvalId: digest.ruleApprovalId,
  });
  if (
    !approval ||
    approval.hash !== digest.ruleHash ||
    !renderSearchAlert(
      { outboxId: row.id, idempotencyKey: row.effectKey, ...payload, secretParams: null },
      { public: rule.publicOrigin, client: rule.clientOrigin },
    )
  )
    return null;
  await lockPublicationSources(db, digest.items);
  const current = await matchingItems(db, search, rule, now, { wanted: digest.items });
  if (
    current.items.length !== digest.items.length ||
    digest.items.some(
      (item) => !current.items.some((live) => hashRequest(live) === hashRequest(item)),
    )
  )
    return null;
  return payload;
}

async function boundedSend(
  provider: MessageProvider,
  row: ActionRow,
  payload: AlertPayload,
): Promise<ProviderResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.send({
        outboxId: row.id,
        idempotencyKey: row.effectKey,
        ...payload,
        secretParams: null,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Alert provider timeout")), 16_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Call with a pool, never inside a caller transaction: `attempting` MUST commit before I/O.
 * A second transaction reacquires and holds consent/publication/approval gates through the
 * bounded handoff. A crash leaves attempting, which is never automatically replayed.
 */
export async function dispatchSearchAlert(
  db: Database,
  provider: MessageProvider,
  actionId: string,
  options: AlertOptions = {},
): Promise<ExternalActionState> {
  await assertRecoveryOpen(db);
  const rule = resolveRule(options);
  const now = options.now ?? new Date();
  const claimed = await db.transaction(async (tx) => {
    // Match planner lock order: subscription before action. It also serializes two workers.
    const [hint] = await tx
      .select({ subscriptionId: externalActions.subjectId, type: externalActions.subjectType })
      .from(externalActions)
      .where(eq(externalActions.id, actionId));
    if (hint?.type !== alertSubjectType || !hint.subscriptionId) throw new AppError("not_found");
    await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.id, hint.subscriptionId))
      .for("update");
    const [row] = await tx
      .select()
      .from(externalActions)
      .where(eq(externalActions.id, actionId))
      .for("update");
    if (!row) throw new AppError("not_found");
    if (row.state !== "queued" || !rule) return { row, claimed: false };
    if (!(await currentPayload(tx, row, rule, now))) {
      await cancel(tx, row.id, "alert_eligibility_changed");
      return { row: { ...row, state: "cancelled" as const }, claimed: false };
    }
    // A definite rejection can retry the same payload only within the provider key window.
    if (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= 86_400_000) {
      await cancel(tx, row.id, "alert_retry_window_expired");
      return { row: { ...row, state: "cancelled" as const }, claimed: false };
    }
    const [updated] = await tx
      .update(externalActions)
      .set({
        state: "attempting",
        attempts: row.attempts + 1,
        firstAttemptAt: row.firstAttemptAt ?? now,
        lastAttemptAt: now,
        provider: provider.name,
        secretPayload: null,
        updatedAt: now,
        version: row.version + 1,
      })
      .where(eq(externalActions.id, row.id))
      .returning();
    if (!updated) throw new Error("Missing alert claim");
    return { row: updated, claimed: true };
  });
  if (!claimed.claimed || !rule) return claimed.row.state;
  return db.transaction(async (tx): Promise<ExternalActionState> => {
    // State was durably claimed. No other dispatch, including an unknown retry, may use it.
    const row = claimed.row;
    const payload = await currentPayload(tx, row, rule, options.now ?? new Date());
    if (!payload) return cancel(tx, row.id, "alert_eligibility_changed");
    const [current] = await tx
      .select()
      .from(externalActions)
      .where(eq(externalActions.id, row.id))
      .for("update");
    if (current?.state !== "attempting" || current.version !== row.version)
      return current?.state ?? "outcome_unknown";
    let result: ProviderResult;
    try {
      result = await boundedSend(provider, row, payload);
    } catch {
      await tx
        .update(externalActions)
        .set({
          state: "outcome_unknown",
          lastErrorCode: "provider_unreachable",
          version: row.version + 1,
        })
        .where(eq(externalActions.id, row.id));
      return "outcome_unknown";
    }
    const state: ExternalActionState =
      result.status === "accepted"
        ? "acknowledged"
        : result.retryable && row.attempts < maxDeliveryAttempts
          ? "queued"
          : "failed";
    await tx
      .update(externalActions)
      .set({
        state,
        updatedAt: now,
        version: row.version + 1,
        ...(result.status === "accepted"
          ? {
              providerReference: result.providerMessageId,
              acknowledgedAt: now,
              lastErrorCode: null,
            }
          : {
              lastErrorCode: "provider_rejected",
              ...(state === "failed" ? { failedAt: now } : {}),
            }),
      })
      .where(eq(externalActions.id, row.id));
    if (state === "acknowledged")
      await tx
        .update(subscriptions)
        .set({ lastSentAt: now })
        .where(eq(subscriptions.id, row.subjectId as string));
    return state;
  });
}

export interface SweepResult {
  readonly inspected: number;
  readonly planned: number;
  readonly dispatched: number;
  readonly nextCursor: string | null;
  readonly disabled: boolean;
}
/** Keyset continuation prevents empty/paused searches starving later subscribers. */
export async function sweepSearchAlerts(
  db: Database,
  provider: MessageProvider,
  options: AlertOptions & { limit?: number; afterId?: string } = {},
): Promise<SweepResult> {
  const rule = resolveRule(options);
  if (!rule) return { inspected: 0, planned: 0, dispatched: 0, nextCursor: null, disabled: true };
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.purpose, "search_alerts"),
        eq(subscriptions.state, "active"),
        options.afterId ? gt(subscriptions.id, options.afterId) : undefined,
      ),
    )
    .orderBy(asc(subscriptions.id))
    .limit(limit + 1);
  let planned = 0,
    dispatched = 0;
  for (const row of rows.slice(0, limit)) {
    const result = await planSearchAlerts(db, row.id, { ...options, rule });
    if (result.state === "queued") planned += 1;
    if (result.state === "queued" || result.state === "existing") {
      await dispatchSearchAlert(db, provider, result.actionId, { ...options, rule });
      dispatched += 1;
    }
  }
  return {
    inspected: Math.min(limit, rows.length),
    planned,
    dispatched,
    nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    disabled: false,
  };
}
